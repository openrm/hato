const assert = require('assert');
const { EventEmitter } = require('events');

const { constants: { Scopes } } = require('..');
const ConnectionRetry = require('./conn-retry');

describe('conn-retry plugin', () => {
    const plugin = new ConnectionRetry({ retries: 3, min: 5, base: 1.5 });

    before(() => {
        global._originalProcess = global.process;
        global.process = new EventEmitter();
    });

    after(() => {
        global.process = global._originalProcess;
    });

    it('should retry connection until it reaches the limit', (done) => {
        const thrown = new Error('error!');

        let count = 0;
        const connect = () => new Promise((resolve, reject) => {
            count++;
            setImmediate(() => reject(thrown));
        });

        const retried = plugin
            .enable()
            .install(Scopes.CONNECTION)(connect);

        retried()
            .catch((err) => {
                assert.strictEqual(count, 3);
                assert.strictEqual(err, thrown);
                done();
            })
            .catch(done);
    });

    it('should abort the retry process on process kill', function(done) {
        const thrown = new Error('error!');
        let count = 0;
        const connect = () => new Promise((resolve, reject) => {
            if (count++ === 0) {
                setImmediate(() => reject(thrown));
                process.emit('SIGINT');
            }
        });

        const plugin = new ConnectionRetry({ retries: 3, min: 5, base: 250 }).enable();
        const retriedConnect = plugin.install(Scopes.CONNECTION)(connect);

        assert.rejects(retriedConnect, (err) => {
            assert.strictEqual(count, 1);
            assert.strictEqual(err.message, 'Retries halted');
            done();
            return true;
        });
    });

    it('should abort retries when told so', (done) => {
        const err = new Error('error!');

        let count = 0;
        const connect = () => new Promise((resolve, reject) => {
            setTimeout(() => {
                reject(err);
                if (count++ > 0) setImmediate(() => plugin.destroy());
            }, 1);
        });

        const retried = plugin
            .enable()
            .install(Scopes.CONNECTION)(connect);

        retried()
            .then(() => {
                done(new Error('Connection should always fail'));
            })
            .catch(done);

        setTimeout(() => {
            assert.strictEqual(count, 2);
            done();
        }, 30);
    });

    it('should rotate through an array of urls, one per attempt, in order with shuffle: false', (done) => {
        const urls = ['amqp://a', 'amqp://b'];
        const seen = [];
        const connect = (url, opts) => new Promise((resolve, reject) => {
            seen.push([url, opts]);
            setImmediate(() => seen.length < 3 ? reject(new Error('x')) : resolve('conn'));
        });

        const plugin = new ConnectionRetry({ retries: 3, min: 5, base: 1.5, shuffle: false }).enable();
        plugin.install(Scopes.CONNECTION)(connect)(urls, { o: 1 })
            .then((conn) => {
                assert.strictEqual(conn, 'conn');
                assert.deepStrictEqual(seen, [
                    ['amqp://a', { o: 1 }],
                    ['amqp://b', { o: 1 }],
                    ['amqp://a', { o: 1 }]
                ]);
                done();
            })
            .catch(done);
    });

    it('should start from a random url by default', (done) => {
        const urls = ['amqp://a', 'amqp://b', 'amqp://c'];
        const seen = [];
        const connect = (url) => new Promise((resolve, reject) => {
            seen.push(url);
            setImmediate(() => seen.length < 3 ? reject(new Error('x')) : resolve('conn'));
        });

        const random = Math.random;
        Math.random = () => 0.5; // offset 1
        const plugin = new ConnectionRetry({ retries: 3, min: 5, base: 1.5 }).enable();
        const attempt = plugin.install(Scopes.CONNECTION)(connect)(urls);
        Math.random = random;

        attempt
            .then(() => {
                assert.deepStrictEqual(seen, ['amqp://b', 'amqp://c', 'amqp://a']);
                done();
            })
            .catch(done);
    });
    describe('defaults', () => {
        let waits;
        const realSetTimeout = global.setTimeout;

        beforeEach(() => {
            waits = [];
            // run the waits at once and record them
            global.setTimeout = (fn, ms) => {
                waits.push(ms);
                return realSetTimeout(fn, 0);
            };
        });

        afterEach(() => {
            global.setTimeout = realSetTimeout;
        });

        it('should keep trying for several minutes, so that a broker moving to another node is waited for', async() => {
            let count = 0;
            const connect = () => {
                count++;
                return Promise.reject(new Error('refused'));
            };
            const attempt = new ConnectionRetry().enable().install(Scopes.CONNECTION)(connect);

            await assert.rejects(attempt('amqp://a'), /refused/);

            assert.strictEqual(count, 30);
            const total = waits.reduce((a, b) => a + b, 0);
            assert.ok(total > 2 * 60 * 1000, `waited only ${total}ms`);
            assert.ok(total < 5 * 60 * 1000, `waited ${total}ms`);
        });

        it('should cap the wait and spread it with jitter', async() => {
            const connect = () => Promise.reject(new Error('refused'));
            const attempt = new ConnectionRetry({ retries: 12 }).enable().install(Scopes.CONNECTION)(connect);

            await assert.rejects(attempt('amqp://a'), /refused/);

            assert.ok(waits.every((ms) => ms <= 10000), 'a wait is above the cap');
            const capped = waits.slice(5); // 2^5 s is past the cap
            assert.ok(capped.every((ms) => ms >= 5000), 'jitter takes more than half of the wait away');
            assert.ok(new Set(capped).size > 1, 'the waits are all the same');
        });

        it('should not leave a signal listener behind per attempt', async() => {
            const before = ['SIGINT', 'SIGTERM'].map((sig) => process.listenerCount(sig));
            const connect = () => Promise.reject(new Error('refused'));
            const attempt = new ConnectionRetry({ retries: 25 }).enable().install(Scopes.CONNECTION)(connect);

            await assert.rejects(attempt('amqp://a'), /refused/);

            assert.deepStrictEqual(['SIGINT', 'SIGTERM'].map((sig) => process.listenerCount(sig)), before);
        });

        it('should not jitter when told so', async() => {
            const connect = () => Promise.reject(new Error('refused'));
            const attempt = new ConnectionRetry({ retries: 5, jitter: 0 }).enable().install(Scopes.CONNECTION)(connect);

            await assert.rejects(attempt('amqp://a'), /refused/);

            assert.deepStrictEqual(waits, [1000, 2000, 4000, 8000]);
        });
    });
});
