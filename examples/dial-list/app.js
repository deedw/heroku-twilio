var TwilioClient = require('../../lib').Client,
    Twiml = require('../../lib/').Twiml,
    creds = require('./config').Credentials,
    numbers = ['+18674451795', '+19058926737', '+18888238895'],
    message = 'Hey there! You are loved. We are on the side of damage, and you are loved.',
    totalToCall = numbers.length,
    totalCalled = 0;

var client = new TwilioClient(creds.sid, creds.authToken, creds.hostname);

/*
// If using mubsub for load balanced servers or cluster processes

var client = new TwilioClient(creds.sid, creds.authToken, creds.hostname, {
    mubsub: {
        url: "mongodb://localhost:27017/twilio"
    }
});
*/

var phone = client.getPhoneNumber(creds.outgoing);
phone.setup(function() {
    // We'll dial each of the numbers in 'numbers' and play them the message
    for(var i = 0; i < numbers.length; i++) {
        phone.makeCall(numbers[i], null, function(call) {
            call.on('answered', function(reqParams, res) {
                res.append(new Twiml.Say(message)).append(new Twiml.Hangup());
                res.send();
                totalCalled += 1;
                if(totalToCall == totalCalled) {
                    // We're done!
                    process.exit(0);
                }
            });
        });
    }
});
