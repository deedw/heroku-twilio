var TwilioClient = require('../../lib').Client,
    Twiml = require('../../lib/').Twiml,
    creds = require('./config').Credentials,
    // Our numbers list. Add more numbers here and they'll get the message
    numbers = ['+18674451795'],
    message = 'WE DAMAGE WE',
    numToSend = numbers.length,
    numSent = 0;

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
    // We'll SMS each of the numbers in 'numbers', sending them the message
    for(var i = 0; i < numbers.length; i++) {
        phone.sendSms(numbers[i], message, null, function(sms) {
            sms.on('processed', function(reqParams, response) {
                console.log('Message processed, request params follow');
                console.log(reqParams);
                numSent += 1;
                if(numSent == numToSend) {
                    // We're done!
                    process.exit(0);
                }
            });
        });
    }
});
