/*jslint node: true */
"use strict";

var AutoUri = require('../lib/auto-uri').AutoUri,
    request = require('request'),
    async = require('async'),
    uuidv4 = require('uuid').v4;

var hostname = "http://localhost";
var port1 = 3301;
var port2 = 3302;
var mongourl = "mongodb://localhost:27017/twilio";

var hostname1 = hostname + ":" + port1;
var hostname2 = hostname + ":" + port2;

async.series([
    // Redis
    function (next) {
        console.log("Redis Store");
        console.log("-----------");
        var autoUri1 = new AutoUri(hostname, {port: port1, redis: {}});
        var autoUri2 = new AutoUri(hostname, {port: port2, redis: {}});
        runTests(autoUri1, autoUri2, next);
    },

    //Mubsub
    function (next) {
        console.log("Mubsub Store");
        console.log("------------");
        var autoUri1 = new AutoUri(hostname, {port: port1, mubsub: {url: mongourl}});
        var autoUri2 = new AutoUri(hostname, {port: port2, mubsub: {url: mongourl}});
        runTests(autoUri1, autoUri2, next);
    }
]);

function runTests(autoUri1, autoUri2, done) {

    var key1, key2, key3, key4, url1, url2, url3, url4;

    async.series([

        //TEST 1. Check autouri works on callback to same server
        function (next) {

            key1 = uuidv4();
            url1 = autoUri1.addCallback(
                'POST',
                function(req, res) {
                    var success = (req.body.key === key1);
                    if (success)
                        console.log("TEST 1 Passed");
                    else
                        console.error("TEST 1 Failed");
                    res.send("TEST1 received");
                },
                {}
            );
            request.post({url: url1, form: {key:key1}}, function(err, httpResponse, body) {
                return next();
            });
        },

        //TEST 2. Check autouri works on callback to different server
        function (next) {

            key2 = uuidv4();
            url1 = autoUri1.addCallback(
                'POST',
                function(req, res) {
                    var success = (req.body.key === key2);
                    if (success)
                        console.log("TEST 2 Passed");
                    else
                        console.error("TEST 2 Failed");
                    res.send("TEST2 received");
                },
                {maxRequests: 1}
            );
            url2 = url1.replace(/3301/, "3302");
            request.post({url: url2, form: {key:key2}}, function(err, httpResponse, body) {
                return next();
            });
        },

        //TEST 3. Check multiple calls more than that specified (maxRequests=1 in TEST2) return 404
        function (next) {

            request.post({url: url2, form: {key:key2}}, function(err, httpResponse, body) {
                var success = (httpResponse.statusCode === 404);
                if (success)
                    console.log("TEST 3 Passed");
                else {
                    console.error("TEST 3 Failed");
                }
                return next();
            });
        },

        //TEST 4. Check autouri returns 404 for calls that it isn't expecting
        function (next) {

            key4 = uuidv4();
            url4 = hostname1 + "/autoprovision/" + key4;
            request.post({url: url4, form: {key:key2}}, function(err, httpResponse, body) {
                var success = (httpResponse.statusCode === 404);
                if (success)
                    console.log("TEST 4 Passed");
                else
                    console.error("TEST 4 Failed");
                return next();
            });
        }

    ], function () {
        autoUri1.close();
        autoUri2.close();
        return done();
    });
}





