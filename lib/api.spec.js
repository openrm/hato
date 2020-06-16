const assert = require('assert');
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
});
