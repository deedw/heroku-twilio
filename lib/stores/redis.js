/*jslint node: true */
"use strict";

var redis = require("redis");
var uuidv4 = require("node-uuid").v4;

function RedisStore (options) {
    options = options || {};
    var self = this;

    this.channel = options.channel || "autouri"; // the name of the pubsub channel

    var host = options.host || "localhost"; // host to connect to redis on (localhost)
    var port = options.port || 6379; // port to connect to redis on (6379)
    var pubOpts = options.pubOpts || {};
    var subOpts = options.subOpts || {};

    this.pubClient = redis.createClient(port, host, pubOpts);
    this.subClient = redis.createClient(port, host, subOpts);

    this.nodeid = uuidv4();
    this.counter = 0;

    function onError(err) {
        // Allow reconnect to occur
        console.error("Redis AutoUri Connection Error", err);
    }


    function onMessage (channel, message) {
        if (channel !== self.channel) return;

        var omsg = {};
        try {
            omsg = JSON.parse(message);
        } catch (e) {
        }

        var key = omsg.key;
        var data = omsg.data;
        if (omsg.nodeid == self.nodeid) return;

        for (var k in self.subscriptions) {
            var sub = self.subscriptions[k];
            if (sub.key === key) {
                sub.handler(key, data);
            }
        }
    }

    this.subscriptions = {};
    this.subClient.subscribe(this.channel);
    this.subClient.on("message", onMessage);

    this.subClient.on("error", onError);
    this.pubClient.on("error", onError);

}


/**
 * Listens for a specific message key. Handler is called with
 * key, message parameters
 */
RedisStore.prototype.subscribe = function (key, handler) {
    var self = this;

    var id = this.counter++;

    var unsubscribe = function (key) {
        var uid = id;
        delete self.subscriptions[uid];
    };

    var subscription = {
        id: id,
        nodeid: id,
        key: key,
        handler: handler,
        unsubscribe: unsubscribe
    };
    this.subscriptions[id] = subscription;

    return subscription;
};


RedisStore.prototype.publish = function (key, message) {
    var omsg = {
        key: key,
        data: message,
        nodeid: this.nodeid
    };
    var jmsg = JSON.stringify(omsg);
    this.pubClient.publish(this.channel, jmsg);
};

RedisStore.prototype.close = function () {
    this.subscriptions = {};
    this.subClient.unsubscribe();
    this.subClient.quit();
    this.pubClient.quit();
};

module.exports = RedisStore;