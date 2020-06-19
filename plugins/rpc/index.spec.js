const assert = require('assert');
const { Client, errors: { TimeoutError, MessageError } } = require('../..');
const RPC = require('../rpc');

describe('rpc plugin', () => {
    let client;

    beforeEach(() => new Client('amqp://guest:guest@127.0.0.1:5672', {
        plugins: [
            new RPC()
        ]
    }).start()
        .then((cli) => client = cli));

    afterEach(() => client && client.close());

    it('should timeout after specified duration', (done) => {
        client
            .subscribe('rpc.1', () => new Promise((resolve) => {
                setTimeout(() => resolve(Buffer.from('hi')), 100);
            }))
            .then(() => client.rpc('rpc.1', Buffer.from('hello'), { timeout: 10 }))
            .then(() => done(new Error('RPC call should fail')))
            .catch((err) => {
                assert.ok(err instanceof TimeoutError);
                done();
            })
            .catch(done);
    });

    it('should but succeed with shorter timeout', (done) => {
        client
            .subscribe('rpc.1', () => Buffer.from('hi'))
            .then(() => client.rpc('rpc.1', Buffer.from('hello'), { timeout: 100 }))
            .then(() => done())
            .catch(done);
    });

    it('should deserialize error context', (done) => {
        client
            .subscribe('rpc.1', (msg) => {
                try {
                    throw new Error('test');
                } catch (e) {
                    msg.nack(false, false, e);
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
            .then(() => client.rpc('rpc.1', Buffer.from('hello')))
            .then(() => done(new Error('RPC call should fail')))
            .catch((err) => {
                assert.ok(err instanceof MessageError);
                assert.strictEqual(err.message, 'test');
                done();
            })
            .catch(done);
    });
});
