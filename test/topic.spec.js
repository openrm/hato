const { Client } = require('../index');

describe('topic', function() {
    let client;
    afterEach(() => client.close());

    it('should receive a basic publish', function(done) {
        client = new Client('amqp://guest:guest@127.0.0.1:5672', {
            logger: console
        });

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

        client.start()
            .then(() => client.exchange(null, 'topic')
                .publish('routing.key.1', Buffer.from(JSON.stringify({ 1: 'message' }))))
            .catch(done);

    });


    it('should be able to use wildcard routing key on topic exchange', function(done) {
        client = new Client('amqp://guest:guest@127.0.0.1:5672', {
            logger: console
        });

        let calls = 0;

        function process(counter) {
            return (msg) => {
                calls += counter;
                msg.ack();

                if (calls === 2) {
                    done();
                } else if (calls === 3) {
                    done(new Error("Message received more than twice"));
                }
            };
        };

        client.exchange(null, 'topic')
            .subscribe('routing.key.#', process(1)).catch(done);


        client.start()
            .then(() => client.exchange(null, 'topic').publish('routing.key.1', Buffer.from("1")))
            .then(() => client.exchange(null, 'topic').publish('routing.key.2', Buffer.from("1")))
            .catch(done);
    });


    it('should be able to create multiple subscribers to receive a single publish', function(done) {
        client = new Client('amqp://guest:guest@127.0.0.1:5672', {
            logger: console
        });

        let calls = 0;

        function process(counter) {
            return (msg) => {
                calls += counter;
                msg.ack();

                if (calls === 4) {
                    done();
                } else if (calls === 2) {
                    done(new Error("Message received twice on the first subscriber"));
                } else if (calls === 6) {
                    done(new Error("Message received twice on the second subscriber"));
                }
            };
        };

        client.exchange(null, 'topic')
            .subscribe('routing.#', process(1)).catch(done);
        client.exchange(null, 'topic')
            .subscribe('routing.key.#', process(3)).catch(done);


        client.start()
            .then(() => client.exchange(null, 'topic').publish('routing.key.1', Buffer.from("1")))
            .catch(done);
    });
});