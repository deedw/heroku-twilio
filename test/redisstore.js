/*jslint node: true */
"use strict";

var RedisStore = require("../lib/stores/redis");

var store1 = new RedisStore();

var store2 = new RedisStore();

store1.subscribe("My key", function (key, message) {
    console.log("store1, %s: %s", key, message);
});

setImmediate(function () {

    store2.publish("My key", "Should print");
    store2.publish("Not my key", "Should not print");

    setTimeout(function () {
        store1.close();
        store2.close();
    }, 1000);

});
