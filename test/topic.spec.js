const { Client } = require('../index');

describe('topic', function() {
    it('should receive a basic publish', function(done) {
        const client = new Client('amqp://guest:guest@127.0.0.1:5672', {
            logger: console
        });

        client.start().catch(done);

        client.exchange(null, 'topic')
            .subscribe('routing.key.#', (msg) => {
                const content = JSON.parse(Buffer.from(msg.content).toString());

                msg.ack();

                if (content[1] === 'message') {
                    done();
                } else {
                    done(new Error("Message not carried properly"));
                }
            })
            .catch(done);

        client.exchange(null, 'topic')
            .publish('routing.key.1', Buffer.from(JSON.stringify({ 1: 'message' })))
            .catch(done);

    });
});
