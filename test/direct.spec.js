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
                confirmed.then(() => done());
            } else {
                done(new Error("Message not carried properly"));
            }
        })
        .catch(done);

        const confirmed = client.publish('a.routing.key', { 1: 'message' }).catch(done);

    });


    it('should round-robin messages on a direct subscriber with the same routing key', function(done) {
        client = new Client('amqp://guest:guest@127.0.0.1:5672', {
            logger: console
        });

        client.start().catch(done);

        let calls = 0;

        function process(counter) {
            return (msg) => {
                calls += counter;
                msg.ack();

                if (calls === 4) {
                    confirmed.then(() => done());
                } else if (calls === 2) {
                    done(new Error("Message received twice on the first subscriber"));
                } else if (calls === 6) {
                    done(new Error("Message received twice on the second subscriber"));
                }
            };
        };

        client.subscribe('a.routing.key.rr', process(1)).catch(done);
        client.subscribe('a.routing.key.rr', process(3)).catch(done);

        const confirmed = Promise.all([
            client.publish('a.routing.key.rr', Buffer.from("1")),
            client.publish('a.routing.key.rr', Buffer.from("1"))
        ]).catch(done);
    });

    it('should receive multiple repeated messages', function(done) {
        client = new Client('amqp://guest:guest@127.0.0.1:5672', {
            logger: console
        });

        client.start().catch(done);

        let calls = 0;

        function process(counter) {
            return (msg) => {
                calls += counter;
                msg.ack();

                if (calls === 2) {
                    confirmed.then(() => done());
                } else if (calls === 3) {
                    done(new Error("Message received more than twice"));
                }
            };
        };

        client.subscribe('a.routing.key.s', process(1)).catch(done);

        const confirmed = Promise.all([
            client.publish('a.routing.key.s', Buffer.from("1")),
            client.publish('a.routing.key.s', Buffer.from("1"))
        ]).catch(done);
    });


    it('should reprocess a rejected message once', function(done) {
        client = new Client('amqp://guest:guest@127.0.0.1:5672', {
            logger: console
        });

        client.start().catch(done);

        let calls = 0;

        function process(counter) {
            return (msg) => {
                calls += counter;

                if (calls === 1) {
                    return msg.nack();
                }

                msg.ack();

                if (calls === 2) {
                    confirmed.then(() => done());
                } else if (calls === 3) {
                    done(new Error("Message processed more than twice"));
                }
            };
        };

        client.subscribe('a.routing.key.s', process(1)).catch(done);

        const confirmed = client.publish('a.routing.key.s', Buffer.from("1")).catch(done);
    });

    it('should be allowed to reuse a queue already declared', function(done) {
        const check = (msg) => {
            if (msg.content.toString() === '1') {
                msg.ack(), confirmed.then(() => done());
            } else done(new Error(`Expected '1' but got ${msg.content.toString()}`));
        };

        const confirmed =
            (client = new Client('amqp://guest:guest@127.0.0.1:5672'))
            .start()
            .then(() => client.queue('foo')) // assert the queue first.
            .then(() => client
                .assert(false)
                .queue('foo')
                .subscribe('a.routing.key', check))
            .then(() => client
                .type('direct')
                .publish('a.routing.key', Buffer.from('1')))
            .catch(done);
    });
});
