const assert = require('assert');
const { Client } = require('../..');
const { MessageError } = require('../../lib/errors');
const Retry = require('.');
const { RetryError, isRetryable } = require('./errors');
const RPC = require('../rpc');

describe('retry plugin', () => {
    let client;
    const retries = 3;

    beforeEach(() => new Client('amqp://guest:guest@127.0.0.1:5672', {
        plugins: [
            new Retry({ retries, min: 10 }),
            new RPC()
        ]
    })
        .start()
        .then((cli) => client = cli));

    afterEach(() => client && client.close());

    it('should retry until it reaches the limit', (done) => {
        let failed = 0;
        client
            .subscribe('it.fails', (msg) => {
                assert.strictEqual(msg.content.toString(), 'hello');
                if (failed++ < retries) throw 'fail!';
                else {
                    assert.strictEqual(failed - 1, retries);
                    assert.ok(failed > 0);
                    done();
                }
            }, { retry: { strategy: 'exponential', base: 1.5 } })
            .on('error', (err) => {
                if (err !== 'fail!') done(err);
            })
            .then(() => client
                .publish('it.fails', Buffer.from('hello')))
            .catch(done);
    });

    it('should dead-letter failed messages', (done) => {
        client
            .subscribe('rpc.1', () => {
                throw 'error!';
            })
            .then(() => client.rpc('rpc.1', Buffer.from('hello')))
            .then(() => done(new Error('RPC call should fail')))
            .catch((err) => {
                assert.strictEqual(err.message, 'error!');
                done();
            })
            .catch(done);
    });

    it('should not retry when negatively acknowledged manually', (done) => {
        let c = 0;
        client
            .subscribe('rpc.nack', (msg) => {
                try {
                    assert.strictEqual(c++, 0);
                } catch (e) {
                    done(e);
                }
                msg.nack(false, false);
                throw 'error!';
            }, { retry: { strategy: 'exponential', base: 1.5 } })
            .on('error', (err) => {
                try {
                    assert.ok(err instanceof RetryError);
                    assert.strictEqual(err.cause.message, 'error!');
                    assert.ok(!isRetryable(err));
                } catch (e) {
                    done(e);
                }
            })
            .then(() => client.rpc('rpc.nack', Buffer.from('hello')))
            .then(() => done(new Error('RPC call should fail')))
            .catch((err) => {
                assert.strictEqual(err.message, 'error!');
                done();
            })
            .catch(done);
    });

    it('should not retry when deeper rpc failed', (done) => {
        Promise.all([
            client.subscribe('rpc.1', () => Buffer.from('hey')),
            client.subscribe('rpc.2', async() => {
                const res = await client.rpc('rpc.1', Buffer.from('he said hello'));
                if (res.content.toString() !== 'hey') done(new Error('Reply does not equal'));
                throw 'error!';
            }),
            client.subscribe('rpc.3', () => client.rpc('rpc.2', Buffer.from('he said hello'))),
            client.subscribe('rpc.4', () => client.rpc('rpc.3', Buffer.from('he said hello')))
        ])
            .then(() => client.rpc('rpc.4', Buffer.from('hello')))
            .then(() => done(new Error('RPC call should fail')))
            .catch((err) => {
                assert.ok(err instanceof MessageError);
                assert.strictEqual(err.message, 'error!');

                const headers = err.msg.properties.headers;
                assert.ok(!('x-retry-count' in headers));

                assert.ok('x-rpc-original-headers' in err.originalHeaders);
                assert.strictEqual(
                    err.originalHeaders['x-rpc-original-headers']['x-retry-count'],
                    retries);

                done();
            })
            .catch(done);
    });
});

