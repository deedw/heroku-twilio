var express = require('express');
var uuid = require("node-uuid");

/**
 * AutoUri: A class for automatedly provisioning URIs and executing callbacks
 * when those URIs are requested.
 *
 * @param {String} hostname: The protocol and hostname of the server running this app, e.g. https://server.domain.com
 * @param {Map} opts: Options
 * opts.express: An existing express application
 * opts.port: The port to run the server on when opts.express not provided. Default: 31337
 * opts.basePath: The basePath for all URIs. Default: 'autoprovision'.
 * opts.pubsubStore: mubsub or redis store. Required for multiple process functionality (e.g. cluster, load balanced servers)
 */
function AutoUri(hostname, opts) {
    var self = this;

    if(!hostname) {
        throw new Error('AutoUri requires hostname');
    }

    opts = opts || {};
    self.hostname = hostname;
    self.basePath = opts.basePath || 'autoprovision';
    self.provisionedPaths = {
        'GET': {},
        'POST': {},
        'DELETE': {},
        'PUT': {}
    };
    if ( opts.express ) {
        self.express = opts.express;
    }else{
        self.port = opts.port || 31337;
        self.express = express();
        self.express.use(express.logger());
        self.express.use(express.json());
        self.express.use(express.urlencoded());
        self.myexpress = self.express.listen(self.port);

    }

    if(self.port){
        self.baseUri = self.hostname + ':' + self.port + '/' + self.basePath + '/';
        // self.baseUri = self.hostname + ':' + 31338 + /*self.port +*/ '/' + self.basePath + '/';
    }else{
        self.baseUri = self.hostname + '/' + self.basePath + '/';
    }

    self.expressPath = '/' + self.basePath + '/:index';

    if (opts.redis) {
        self.pubsubStore = new (require("./stores/redis"))(opts.redis);
    } else if (opts.mubsub) {
        self.pubsubStore = new (require("./stores/mubsub"))(opts.mubsub);
    }


    self.handleRequest = function(type) {
        return function(req, res) {
            if(!req.params.index) {
                throw new Error('Unprovisioned uri requested: No index param.');
            }

            var index = req.params.index;
            var callback = self.provisionedPaths[type][index];
            var subscription;

            if (callback) return callback(req, res);

            if (!self.pubsubStore) {
                    // Unprovisioned URI
                    return req.send(404);
                    // throw new Error('Unprovisioned uri requested: Unknown index.');
            }

            // Publish index on pubsub store and wait for owning process to generate result

            // set timeout for maximum response time
            var timeout = setTimeout(function() {
                // Cancel subscription and return http error
                if (subscription) subscription.unsubscribe(index + "response");
                return res.send(404);
            }, 20000);

            // Await response from owning process
            subscription = self.pubsubStore.subscribe(index + "response", function (key, doc) {
                clearTimeout(timeout);
                subscription.unsubscribe(index + "response");

                var statusCode = doc.status;
                var contentType = doc.contenttype;
                var body = doc.body;

                if (statusCode) res.status(statusCode);
                if (contentType) res.set('Content-Type', contentType);
                return res.send(body);
            });

            // Publish details of this request for owning process to pick up
            var util = require("util");
            self.pubsubStore.publish(index + "request", {
                index: index,
                method: type,
                body: req.body
            });
        };
    };

    self.express.get(self.expressPath, self.handleRequest('GET'));
    self.express.post(self.expressPath, self.handleRequest('POST'));
    self.express.delete(self.expressPath, self.handleRequest('PUT'));
    self.express.put(self.expressPath, self.handleRequest('DELETE'));
}

module.exports.AutoUri = AutoUri;

/**
 * addCallback: Create a new URI and callback when it's requested
 *
 * @param {String} method: The HTTP method for this callback.
 * @param {Function} fn: The callback
 * @param {Map} opts: Options:
 * opts.customIndex: A custom index for this URI. Default is GUID.
 * opts.expireTimeout: Specify a timeout for removing this callback (ms)
 * opts.maxRequests: Specify a maximum number of requests before expiring. > 0
 */
AutoUri.prototype.addCallback = function(method, fn, opts) {
    if(!method || !fn) {
        throw new Error('addCallback requires method and fn parameters');
    }

    if(!method.match(/get|post|put|delete/i)) {
        throw new Error('Method must be either GET, PUT, POST, or DELETE');
    }

    var self = this;
    var index;

    method = method.toUpperCase();
    opts = opts || {};

    if(opts.customIndex) {
        index = opts.customIndex;
    } else {
        index = uuid.v4();
    }

    if(opts.maxRequests) {
        var callback = fn,
            numReqs = 0;

        fn = function(req, res) {
            callback(req, res);
            numReqs += 1;
            if(numReqs == opts.maxRequests) {
                delete self.provisionedPaths[method][index];
            }
        };
    }

    self.provisionedPaths[method][index] = fn; // when request comes into owner

    if (self.pubsubStore) {
        // handle requests coming in from another process. Other process
        // will look after response back to Twilio. Events triggered in this process.
        var subscription = self.pubsubStore.subscribe(index + "request", function(key, doc) {

            var index = doc.index;
            var method = doc.method;
            var reqbody = doc.body;

            if (!self.provisionedPaths[method][index]) {
                // allow for maxRequests
                subscription.unsubscribe();
                return;
            }

            var status = 200;

            var res = {};

            res.status = function (code) {
                status = code;
            };

            res.send = function(body) {
                self.pubsubStore.publish(index + "response", {
                    status: status,
                    body: body
                });

            };

            fn({body:reqbody}, res);
        });
    }

    if(opts.expireTimeout) {
        setTimeout(function() {
            delete self.provisionedPaths[method][index];
        }, opts.expireTimeout);
    }

    return self.baseUri + index;
};

AutoUri.prototype.close = function () {
    if (this.myexpress) this.myexpress.close();
    this.myexpress = null;
    if (this.pubsubStore) this.pubsubStore.close();
    this.pubsubStore = null;
};