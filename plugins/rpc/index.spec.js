const assert = require('assert');
const { Client, errors: { TimeoutError, MessageError } } = require('../..');
const RPC = require('../rpc');

describe('rpc plugin', () => {
    let client;

    beforeEach(async function() {
        client = await new Client('amqp://guest:guest@127.0.0.1:5672', {
            plugins: [
                new RPC()
            ]
        }).start();
    });

    afterEach(() => client && client.close());

    it('should timeout after specified duration', (done) => {
        client
            .subscribe('rpc.1', () => new Promise((resolve) => {
                setTimeout(() => resolve(Buffer.from('hi')), 50);
            }))
            .then(() => client.rpc('rpc.1', Buffer.from('hello'), { timeout: 10 }))
            .then(() => done(new Error('RPC call should fail')))
            .catch((err) => {
                assert.ok(err instanceof TimeoutError);
                return new Promise((resolve) => setTimeout(resolve, 100)); // wait for reply
            })
            .then(() => done())
            .catch(done);
    });

    it('should but succeed with shorter timeout', (done) => {
        client
            .subscribe('rpc.2', () => Buffer.from('hi'))
            .then(() => client.rpc('rpc.2', Buffer.from('hello'), { timeout: 100 }))
            .then(() => done())
            .catch(done);
    });

    it('should work with reply API', (done) => {
        client
            .subscribe('rpc.3', (msg) => {
                if (typeof msg.reply !== 'function') {
                    done(new Error('[msg.reply] not a function'));
                } else {
                    msg.reply(null, Buffer.from('hi'));
                }
            })
            .then(() => client.rpc('rpc.3', Buffer.from('hello')))
            .then((msg) => {
                assert.strictEqual(msg.content.toString(), 'hi');
                done();
            })
            .catch(done);
    });

    it('should reply with errors', (done) => {
        client
            .subscribe('rpc.4', (msg) => msg.reply(new Error('test')))
            .then(() => client.rpc('rpc.4', Buffer.from('hello')))
            .then(() => done(new Error('RPC call should fail')))
            .catch((err) => {
                assert.ok(err instanceof MessageError);
                assert.strictEqual(err.message, 'test');
                done();
            })
            .catch(done);
    });

    it('should deserialize error context', (done) => {
        client
            .subscribe('rpc.5', (msg) => {
                try {
                    throw new Error('test');
                } catch (e) {
                    msg.nack(false, false);
                    throw e;
                }
            })
            .on('error', (err) => {
                try {
                    assert.strictEqual(err.message, 'test');
                } catch (e) {
                    done(e);
                }
            })
            .then(() => client.rpc('rpc.5', Buffer.from('hello')))
            .then(() => done(new Error('RPC call should fail')))
            .catch((err) => {
                assert.ok(err instanceof MessageError);
                assert.strictEqual(err.message, 'test');
                done();
            })
            .catch(done);
    });
});
