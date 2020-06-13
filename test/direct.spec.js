const assert = require('assert');
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

        const MSG = { 1: 'message' };

        client.subscribe('a.routing.key', async(msg) => {
            msg.ack();

            const content = msg.content;
            assert.deepStrictEqual(content, MSG);

            await confirmed;

            done();
        })
            .on('error', done)
            .catch(done);

        const confirmed = client.publish('a.routing.key', MSG).catch(done);
    });


    it('should round-robin messages on a direct subscriber with the same routing key', function(done) {
        client = new Client();

        client.start().catch(done);

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

        client.subscribe('a.routing.key.rr', process(1))
            .on('error', done)
            .catch(done);
        client.subscribe('a.routing.key.rr', process(3))
            .on('error', done)
            .catch(done);

        const confirmed = Promise.all([
            client.publish('a.routing.key.rr', Buffer.from("1")),
            client.publish('a.routing.key.rr', Buffer.from("1"))
        ]).catch(done);
    });

    it('should receive multiple repeated messages', function(done) {
        client = new Client();

        client.start().catch(done);

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

        client.subscribe('a.routing.key.s', process(1))
            .on('error', done)
            .catch(done);

        const confirmed = Promise.all([
            client.publish('a.routing.key.s', Buffer.from("1")),
            client.publish('a.routing.key.s', Buffer.from("1"))
        ]).catch(done);
    });


    it('should reprocess a rejected message once', function(done) {
        client = new Client();

        client.start().catch(done);

        let calls = 0;

        function process(counter) {
            return async(msg) => {
                calls += counter;

                if (calls === 1) return msg.nack();

                msg.ack();

                assert.ok(calls < 3, 'Message received more than twice');
                assert.strictEqual(calls, 2);

                await confirmed;
                done();
            };
        };

        client.subscribe('a.routing.key.s', process(1))
            .on('error', done)
            .catch(done);

        const confirmed = client.publish('a.routing.key.s', Buffer.from("1")).catch(done);
    });

    it('should be allowed to reuse a queue already declared', function(done) {
        const check = async(msg) => {
            msg.ack();
            assert.strictEqual(msg.content.toString(), '1');
            await confirmed;
            done();
        };

        const confirmed =
            (client = new Client())
                .start()
                .then(() => client.queue('foo', { exclusive: true })) // Assert the queue first.
                .then(() => client
                    .assert(false)
                    .queue('foo')
                    .subscribe('a.routing.key', check)
                    .on('error', done))
                .then(() => client
                    .type('direct')
                    .publish('a.routing.key', Buffer.from('1')))
                .catch(done);
    });
});
