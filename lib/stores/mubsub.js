/*jslint node: true */
"use strict";

var mubsub = require("mubsub");

function MubSubStore (options) {
    options = options || {};

    options.collection = options.collection || "autouri"; // capped collection name
    options.size = options.size || 100000 ; // max size in bytes for capped collection
    options.num = options.num || null ; // max number of documents inside of capped collection
    options.url = options.url || null ; // db url e.g. "mongodb://localhost:27017/yourdb"
    options.connection = options.connection || null; // db connection to use (in preference to url)
    var mdb = options.connection || options.url;
    this.mubsubclient = mubsub(mdb, {safe: true});

    this.mubsubchannel = this.mubsubclient.channel(options.collection, options);

    this.subscriptions = {};
}


/**
 * Listens for a specific message key. Handler is called with
 * key, message parameters
 */
MubSubStore.prototype.subscribe = function (key, handler) {
    if (!handler) return null;

    return this.mubsubchannel.subscribe(key, function (message) {
        return handler(key, message);
    });
};


MubSubStore.prototype.publish = function (key, message) {
    this.mubsubchannel.publish(key, message);
};

MubSubStore.prototype.close = function () {
    this.mubsubclient.close();
    this.mubsubclient = null;
    this.mubsubchannel = null;
};

module.exports = MubSubStore;