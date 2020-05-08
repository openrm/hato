const { Client } = require('..');
const { Encoding } = require('../plugins');

describe('direct', function() {
    let client;
    afterEach(() => client.close());
    it('should receive a basic publish', function(done) {
        client = new Client('amqp://guest:guest@127.0.0.1:5672', {
            plugins: [
                new Encoding('json')
            ]
        });

        client.start().catch(done);

        client.subscribe('a.routing.key', (msg) => {
            const content = msg.content;
            msg.ack();

            if (content[1] === 'message') {
                done();
            } else {
                done(new Error("Message not carried properly"));
            }
        })
        .catch(done);

        client.publish('a.routing.key', { 1: 'message' }).catch(done);

    });
});
