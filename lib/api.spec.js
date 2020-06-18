const assert = require('assert');
const sinon = require('sinon');
const { Client } = require('..');

describe('api', () => {
    let client;

    beforeEach(() => client = new Client());
    afterEach(() => client.close());

    it('should be allowed to reuse a queue already declared', function(done) {
        const check = async(msg) => {
            msg.ack();
            assert.strictEqual(msg.content.toString(), '1');
            await confirmed;
            done();
        };

        const confirmed = client
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

    it('should provide a property on consumer to cancel itself', async function() {
        await client.start();
        const consumer = await client
            .subscribe('a.key', () => {});

        assert.ok(consumer.cancel);
        assert.strictEqual(typeof consumer.cancel, 'function');

        const ch = await client._asserted();

        sinon.spy(ch);
        consumer.cancel();

        assert.ok(ch.cancel.calledOnce);
        assert.strictEqual(ch.cancel.args[0][0], consumer.consumerTag);

        sinon.restore();
    });
});
