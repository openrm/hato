const assert = require('assert');
const { Client } = require('../index');

describe('topic', function() {
    let client;
    afterEach(() => client.close());

    it('should receive a basic publish', function(done) {
        client = new Client();

        const MSG = { 1: 'message' };

        client.type('topic')
            .subscribe('routing.key.#', async(msg) => {
                const content = JSON.parse(Buffer.from(msg.content).toString());

                msg.ack();

                assert.deepStrictEqual(content, MSG);

                await confirmed;
                done();
            })
            .on('error', done)
            .catch(done);

        const confirmed = client.start()
            .then(() => client.type('topic')
                .publish('routing.key.1', Buffer.from(JSON.stringify(MSG))))
            .catch(done);

    });


    it('should be able to use wildcard routing key on topic exchange', function(done) {
        client = new Client();

        let calls = 0;

        function process(counter) {
            return async(msg) => {
                calls += counter;
                msg.ack();

                if (calls === 1) return;

                assert.ok(calls < 3, 'Message received more than twice');
                assert.strictEqual(calls, 2);

                await confirmed;
                done();
            };
        };

        client.type('topic')
            .subscribe('routing.key.#', process(1))
            .on('error', done)
            .catch(done);


        const confirmed = client.start()
            .then(() => client.type('topic').publish('routing.key.1', Buffer.from("1")))
            .then(() => client.type('topic').publish('routing.key.2', Buffer.from("1")))
            .catch(done);
    });


    it('should be able to create multiple subscribers to receive a single publish', function(done) {
        client = new Client();

        let calls = 0;

        function process(counter) {
            return async(msg) => {
                calls += counter;
                msg.ack();

                if (calls % 2 === 1) return;

                assert.ok([2, 4, 6].includes(calls),
                    'Subscriber received an unexpected message');
                assert.notStrictEqual(calls, 2,
                    'Message received twice on the first subscriber');
                assert.notStrictEqual(calls, 6,
                    'Message received twice on the second subscriber');
                assert.strictEqual(calls, 4);

                await confirmed;
                done();
            };
        };

        client.type('topic')
            .subscribe('routing.#', process(1))
            .on('error', done)
            .catch(done);
        client.type('topic')
            .subscribe('routing.key.#', process(3))
            .on('error', done)
            .catch(done);


        const confirmed = client.start()
            .then(() => client.type('topic').publish('routing.key.1', Buffer.from("1")))
            .catch(done);
    });
});
