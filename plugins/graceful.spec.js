const assert = require('assert');
const sinon = require('sinon');
const { EventEmitter } = require('events');

const { constants: { Scopes } } = require('..');
const GracefulShutdown = require('./graceful');

const conn = new EventEmitter();
const _connect = () => Promise.resolve(conn);

describe('graceful plugin', () => {
    let connect = Promise.resolve;

    beforeEach(() => {
        // drain: false, the original behaviour: the connection is closed at once
        const plugin = new GracefulShutdown({ drain: false }).enable();
        connect = plugin
            .install(Scopes.CONNECTION)(_connect);

        conn.close = sinon.fake.resolves();

        global._originalProcess = global.process;
        global.process = new EventEmitter();
    });

    afterEach(() => {
        sinon.restore();
        conn.emit('close');
        global.process = global._originalProcess;
    });

    it('should terminate the connection on process kill', () => connect()
        .then(() => {
            process.emit('SIGTERM');
            assert.ok(conn.close.called);
        }));

    it('should close the connection only once', () => connect()
        .then(() => {
            process.emit('SIGTERM');
            process.emit('SIGINT');

            assert.ok(conn.close.calledOnce);
        }));

    it('should not call close() after closed', () => {
        const noop = () => {};
        process.on('SIGINT', noop);
        return connect()
            .then(() => {
                conn.emit('close');
                process.emit('SIGINT');

                assert.ok(!conn.close.called);

                process.removeListener('SIGINT', noop);
            });
    });
});

describe('graceful plugin: draining', () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const logger = () => ({
        debug: sinon.fake(), info: sinon.fake(), warn: sinon.fake(), error: sinon.fake()
    });

    // What the plugin stacks on: consume() ends in _consume(), which resolves to a consumer that can cancel itself
    const channelOf = (plugin) => {
        const cancelled = [];
        const Base = class {
            _consume(ch, queue, fn) {
                this.handlers = (this.handlers || []).concat(fn);
                return Promise.resolve({ consumerTag: queue, cancel: () => { cancelled.push(queue); return Promise.resolve(); } });
            }
            consume(binding, fn) {
                return this._consume('ch', binding, fn);
            }
        };
        const channel = new (plugin.install(Scopes.API)(Base))();
        return { channel, cancelled };
    };

    const enabled = (options) => new GracefulShutdown(options).enable(logger());

    afterEach(() => sinon.restore());

    describe('tracking', () => {
        it('counts a message as in progress until its handler has finished', async() => {
            const plugin = enabled();
            const { channel } = channelOf(plugin);
            await channel.consume('q', () => sleep(30));

            assert.strictEqual(plugin.inflight, 0);
            const running = channel.handlers[0]({ content: 1 });
            assert.strictEqual(plugin.inflight, 1);

            assert.strictEqual(await plugin.drain(1000), true);
            assert.strictEqual(plugin.inflight, 0);
            await running;
        });

        it('drains at once when nothing is in progress', async() => {
            assert.strictEqual(await enabled().drain(1000), true);
        });

        it('waits for all the messages, of all the subscriptions', async() => {
            const plugin = enabled();
            const { channel } = channelOf(plugin);
            const done = [];
            await channel.consume('a', async() => { await sleep(20); done.push('a'); });
            await channel.consume('b', async() => { await sleep(60); done.push('b'); });

            channel.handlers[0]({});
            channel.handlers[1]({});
            assert.strictEqual(plugin.inflight, 2);

            assert.strictEqual(await plugin.drain(1000), true);
            assert.deepStrictEqual(done, ['a', 'b']);
        });

        it('gives up waiting at the timeout and says so', async() => {
            const plugin = enabled();
            const { channel } = channelOf(plugin);
            await channel.consume('q', () => sleep(150));

            const running = channel.handlers[0]({});
            assert.strictEqual(await plugin.drain(20), false);
            assert.strictEqual(plugin.inflight, 1);
            await running;
            assert.strictEqual(plugin.inflight, 0);
        });

        it('counts a failed handler as done and passes its error on', async() => {
            const plugin = enabled();
            const { channel } = channelOf(plugin);
            await channel.consume('q', () => { throw new Error('boom'); });

            await assert.rejects(() => channel.handlers[0]({}), /boom/);
            assert.strictEqual(plugin.inflight, 0);
        });

        it('hands the handler what it is given, including the null of a cancelled consumer', async() => {
            const plugin = enabled();
            const { channel } = channelOf(plugin);
            const seen = [];
            await channel.consume('q', (msg) => seen.push(msg));

            await channel.handlers[0](null);
            await channel.handlers[0]({ content: 1 });

            assert.deepStrictEqual(seen, [null, { content: 1 }]);
        });
    });

    describe('stopConsuming()', () => {
        it('cancels the subscriptions, not the other consumers of the channel', async() => {
            const plugin = enabled();
            const { channel, cancelled } = channelOf(plugin);
            await channel.consume('subscription.1', () => {});
            await channel.consume('subscription.2', () => {});
            // what the rpc plugin does for its reply queue: still needed by the messages in progress
            await channel._consume('ch', 'rpc.replies', () => {});

            await plugin.stopConsuming();

            assert.deepStrictEqual(cancelled.sort(), ['subscription.1', 'subscription.2']);
        });

        it('cancels the others when one cannot be cancelled', async() => {
            const plugin = enabled();
            const cancelled = [];
            const Base = class {
                _consume(ch, queue) {
                    return Promise.resolve({
                        cancel: queue === 'broken' ?
                            () => Promise.reject(new Error('channel closed')) :
                            () => { cancelled.push(queue); return Promise.resolve(); }
                    });
                }
                consume(binding, fn) { return this._consume('ch', binding, fn); }
            };
            const channel = new (plugin.install(Scopes.API)(Base))();
            await channel.consume('broken', () => {});
            await channel.consume('fine', () => {});

            await plugin.stopConsuming();

            assert.deepStrictEqual(cancelled, ['fine']);
        });

        it('forgets a subscription that could not be established', async() => {
            const plugin = enabled();
            const Base = class {
                consume() { return Promise.reject(new Error('no channel')); }
                _consume() {}
            };
            const channel = new (plugin.install(Scopes.API)(Base))();

            await assert.rejects(() => channel.consume('q', () => {}), /no channel/);
            await plugin.stopConsuming();
        });
    });

    describe('on a signal', () => {
        let order;
        let plugin;
        let channel;

        const connect = () => {
            conn.close = sinon.fake(() => { order.push('close'); return Promise.resolve(); });
            return plugin.install(Scopes.CONNECTION)(_connect)();
        };

        beforeEach(async() => {
            order = [];
            global._originalProcess = global.process;
            global.process = new EventEmitter();
        });

        afterEach(() => {
            conn.emit('close');
            global.process = global._originalProcess;
        });

        const subscribe = async(handler) => {
            const Base = class {
                _consume(ch, queue, fn) {
                    this.handler = fn;
                    return Promise.resolve({ cancel: () => { order.push('cancel'); return Promise.resolve(); } });
                }
                consume(binding, fn) { return this._consume('ch', binding, fn); }
            };
            channel = new (plugin.install(Scopes.API)(Base))();
            await channel.consume('q', handler);
        };

        it('stops consuming, waits for the messages in progress, then closes the connection', async() => {
            plugin = enabled({ drain: { timeout: 1000 } });
            await subscribe(async() => { await sleep(60); order.push('handled'); });
            await connect();

            channel.handler({ content: 1 });
            process.emit('SIGTERM');

            await sleep(20);
            assert.ok(!conn.close.called, 'closed while a message was in progress');

            await sleep(120);
            assert.deepStrictEqual(order, ['cancel', 'handled', 'close']);
        });

        it('closes anyway when the messages are not done at the timeout', async() => {
            plugin = enabled({ drain: { timeout: 30 } });
            await subscribe(() => sleep(300));
            await connect();

            channel.handler({});
            process.emit('SIGTERM');

            await sleep(100);
            assert.ok(conn.close.calledOnce);
            assert.ok(plugin.logger.warn.calledOnce);
        });

        it('drains by default', async() => {
            plugin = enabled();
            assert.strictEqual(plugin.options.drain.timeout, 30000);
            await subscribe(async() => { await sleep(60); order.push('handled'); });
            await connect();

            channel.handler({ content: 1 });
            process.emit('SIGTERM');

            await sleep(20);
            assert.ok(!conn.close.called, 'closed while a message was in progress');

            await sleep(120);
            assert.deepStrictEqual(order, ['cancel', 'handled', 'close']);
        });

        it('leaves the signals to the application with signals: false, which can still drain', async() => {
            plugin = enabled({ signals: false });
            await subscribe(async() => { await sleep(40); order.push('handled'); });
            await connect();

            assert.strictEqual(process.listenerCount('SIGTERM'), 0);
            assert.strictEqual(process.listenerCount('SIGINT'), 0);

            channel.handler({});
            process.emit('SIGTERM');
            await sleep(10);
            assert.ok(!conn.close.called);

            await plugin.stopConsuming();
            assert.strictEqual(await plugin.drain(1000), true);
            assert.deepStrictEqual(order, ['cancel', 'handled']);
        });

        it('handles SIGINT and SIGTERM by default', async() => {
            plugin = enabled();
            await connect();

            assert.deepStrictEqual(plugin.options.signals, ['SIGINT', 'SIGTERM']);
            assert.strictEqual(process.listenerCount('SIGINT'), 1);
            assert.strictEqual(process.listenerCount('SIGTERM'), 1);
            assert.strictEqual(process.listenerCount('SIGHUP'), 0);
        });

        it('handles the signals of the list, and only those', async() => {
            plugin = enabled({ signals: ['SIGTERM', 'SIGHUP'] });
            await connect();

            assert.strictEqual(process.listenerCount('SIGTERM'), 1);
            assert.strictEqual(process.listenerCount('SIGHUP'), 1);
            assert.strictEqual(process.listenerCount('SIGINT'), 0);

            process.emit('SIGINT');
            await sleep(20);
            assert.ok(!conn.close.called, 'a signal that is not in the list closed the connection');

            process.emit('SIGHUP');
            await sleep(20);
            assert.ok(conn.close.calledOnce);
        });

        it('takes an empty list for no signal at all', async() => {
            plugin = enabled({ signals: [] });
            await connect();

            assert.strictEqual(process.listenerCount('SIGINT'), 0);
            assert.strictEqual(process.listenerCount('SIGTERM'), 0);
        });

        it('listens once for a signal named twice, and stops listening when the connection is closed', async() => {
            plugin = enabled({ signals: ['SIGTERM', 'SIGTERM'] });
            await connect();
            assert.strictEqual(process.listenerCount('SIGTERM'), 1);

            conn.emit('close');
            assert.strictEqual(process.listenerCount('SIGTERM'), 0);
        });

        it('closes only once, however many signals come', async() => {
            plugin = enabled({ drain: true });
            await subscribe(() => {});
            await connect();

            process.emit('SIGTERM');
            process.emit('SIGINT');

            await sleep(20);
            assert.ok(conn.close.calledOnce);
        });

        it('closes at once with drain: false, a message in progress or not', async() => {
            plugin = enabled({ drain: false });
            await subscribe(() => sleep(100));
            await connect();

            channel.handler({});
            process.emit('SIGTERM');

            assert.ok(conn.close.calledOnce);
            assert.deepStrictEqual(order, ['close']);
        });
    });
});

describe('graceful plugin: signals option', () => {
    it('refuses what it cannot handle, when it is created', () => {
        assert.throws(() => new GracefulShutdown({ signals: ['SIGTERM', 'SIGNOPE'] }), /cannot handle the signal SIGNOPE/);
        assert.throws(() => new GracefulShutdown({ signals: ['SIGKILL'] }), /cannot handle the signal SIGKILL/);
        assert.throws(() => new GracefulShutdown({ signals: ['SIGSTOP'] }), /cannot handle the signal SIGSTOP/);
        assert.throws(() => new GracefulShutdown({ signals: 'SIGTERM' }), /boolean or a list/);
    });

    it('accepts true, false and a list', () => {
        assert.deepStrictEqual(new GracefulShutdown().options.signals, ['SIGINT', 'SIGTERM']);
        assert.deepStrictEqual(new GracefulShutdown({ signals: true }).options.signals, ['SIGINT', 'SIGTERM']);
        assert.deepStrictEqual(new GracefulShutdown({ signals: false }).options.signals, []);
        assert.deepStrictEqual(new GracefulShutdown({ signals: ['SIGUSR2'] }).options.signals, ['SIGUSR2']);
    });
});
