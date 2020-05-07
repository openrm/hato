const { Client } = require('../index');

describe('direct', function() {
    it('should receive a basic publish', function(done) {
        const client = new Client('amqp://guest:guest@127.0.0.1:5672', {
            logger: console
        });

        client.start().catch(done);

        client.subscribe('a.routing.key', (msg) => {
            const content = JSON.parse(Buffer.from(msg.content).toString());
            msg.ack();

            if (content[1] === 'message') {
                done();
            } else {
                done(new Error("Message not carried properly"));
            }
        })
        .catch(done);

        client.publish('a.routing.key', Buffer.from(JSON.stringify({ 1: 'message' }))).catch(done);

    });
});
