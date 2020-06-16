const assert = require('assert');
const { Client, errors: { UnroutableMessageError } } = require('..');
const Confirm = require('./confirm');

describe('confirm plugin', () => {
    let client;

    beforeEach(
        () => new Client('amqp://guest:guest@127.0.0.1:5672', {
            plugins: [new Confirm()]
        })
            .start()
            .then((cli) => client = cli)
    );

    afterEach(() => client.close());

    it('should fail a publish when unroutable', (done) => {
        const opts = { mandatory: true };
        client.publish('non.existent', Buffer.from('hello'), opts)
            .then(() => done(new Error('Unroutable message does not fail')))
            .catch((err) => {
                assert.ok(err instanceof UnroutableMessageError);

                const { fields } = err.msg;
                assert.strictEqual(fields.routingKey, 'non.existent');
                assert.strictEqual(fields.replyCode, 312);

                done();
            })
            .catch(done);
    });
});
