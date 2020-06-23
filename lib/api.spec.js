const assert = require('assert');
const sinon = require('sinon');
const { Client } = require('..');
const API = require('./api');

describe('api', () => {
    let client;

    beforeEach(async() => {
        client = await new Client().start();
        sinon.spy(await client._asserted());
    });
    afterEach(() => {
        sinon.restore();
        return client.close();
    });

    it('should return api instances', async() => {
        [
            ['context', {}],
            ['assert', false],
            ['type', 'topic'],
            ['exchange', 'an.exchange', 'direct'],
            ['queue', 'a.queue', { exclusive: true }]
        ]
            .forEach(([fn, ...args]) => {
                const ctx = client[fn](...args);
                assert.ok(ctx instanceof API);
            });

        const ch = await client._asserted();
        return ch.deleteExchange('an.exchange');
    });

    const cases = {
        'the default exchange': {
            do: (client) => client,
            assert: (ctx, ch) => {
                assert.ok(ctx.assert);
                assert.strictEqual(ctx.exchange, '');

                assert.strictEqual(ch.checkExchange.callCount, 0);
            }
        },
        'the default direct exchange': {
            do: (client) => client.type('direct'),
            assert: (ctx, ch) => {
                assert.ok(ctx.assert);
                assert.strictEqual(ctx.exchange, 'amq.direct');

                assert.ok(ch.checkExchange.calledOnce);
                assert.deepStrictEqual(ch.checkExchange.args[0], ['amq.direct']);
            }
        },
        'the default fanout exchange': {
            do: (client) => client.type('fanout'),
            assert: (ctx, ch) => {
                assert.ok(ctx.assert);
                assert.strictEqual(ctx.exchange, 'amq.fanout');

                assert.ok(ch.checkExchange.calledOnce);
                assert.deepStrictEqual(ch.checkExchange.args[0], ['amq.fanout']);
            }
        },
        'a named exchange': {
            do: (client) => client
                .exchange('an.exchange', 'headers', { autoDelete: true }),
            assert: (ctx, ch) => {
                assert.ok(ctx.assert);
                assert.strictEqual(ctx.exchange, 'an.exchange');

                assert.ok(ch.assertExchange.calledOnce);
                assert.deepStrictEqual(ch.assertExchange.args[0], ['an.exchange', 'headers', { autoDelete: true }]);
            },
            after: (ch) => ch.deleteExchange('an.exchange')
        },
        'an anonymous queue using the default exchange': {
            do: (client) => client
                .queue('', { exclusive: true }),
            assert: (ctx, ch) => {
                assert.ok(ctx.assert);
                assert.strictEqual(ctx.exchange, '');
                assert.strictEqual(ctx.queue, '');

                assert.ok(ch.assertQueue.calledOnce);
                assert.deepStrictEqual(ch.assertQueue.args[0], ['', { exclusive: true }]);
            }
        },
        'a named queue using the default topic exchange': {
            do: (client) => client.type('topic').queue('a.queue', { exclusive: true }),
            assert: (ctx, ch) => {
                assert.ok(ctx.assert);
                assert.strictEqual(ctx.exchange, 'amq.topic');
                assert.strictEqual(ctx.queue, 'a.queue');

                assert.ok(ch.checkExchange.calledOnce);
                assert.deepStrictEqual(ch.checkExchange.args[0], ['amq.topic']);
                assert.ok(ch.assertQueue.calledOnce);
                assert.deepStrictEqual(ch.assertQueue.args[0], ['a.queue', { exclusive: true }]);
            }
        },
        'an already declared queue': {
            before: (ch) => ch.assertQueue('a.declared', { exclusive: true }),
            do: (client) => client
                .assert(false)
                .type('topic')
                .queue('a.declared'),
            assert: (ctx, ch) => {
                assert.ok(!ctx.assert);
                assert.strictEqual(ctx.exchange, 'amq.topic');
                assert.strictEqual(ctx.queue, 'a.declared');

                assert.ok(ch.checkQueue.calledOnce);
                assert.deepStrictEqual(ch.checkQueue.args[0], ['a.declared']);
            }
        },
        'an already declared exchange': {
            before: (ch) => ch.assertExchange('a.declared'),
            do: (client) => client
                .queue('a.queue', { exclusive: true })
                .assert(false)
                .exchange('a.declared'),
            assert: (ctx, ch) => {
                assert.ok(!ctx.assert);
                assert.strictEqual(ctx.exchange, 'a.declared');
                assert.strictEqual(ctx.queue, 'a.queue');

                assert.ok(ch.checkExchange.calledOnce);
                assert.deepStrictEqual(ch.checkExchange.args[0], ['a.declared']);
                assert.ok(ch.assertQueue.calledOnce);
                assert.deepStrictEqual(ch.assertQueue.args[0], ['a.queue', { exclusive: true }]);
            },
            after: (ch) => ch.deleteExchange('a.declared')
        }
    };

    Object.entries(cases).forEach(([name, test]) => {
        it(`should associate ${name}`, async() => {
            if (test.before) await test.before(await client._asserted());

            const ctx = test.do(client)._validateContext();
            const ch = await client._asserted();
            test.assert(ctx, ch);

            if (test.after) await test.after(ch);
        });
    });

    it('should be allowed to reuse a queue already declared', (done) => {
        const check = async(msg) => {
            msg.ack();
            assert.strictEqual(msg.content.toString(), '1');
            await confirmed;
            done();
        };

        client
            .queue('foo', { exclusive: true }); // Assert the queue first.

        client
            .assert(false)
            .queue('foo')
            .subscribe('a.routing.key', check)
            .on('error', done);

        const confirmed = client
            .type('direct')
            .publish('a.routing.key', Buffer.from('1'))
            .catch(done);
    });

    it('should provide a property on consumer to cancel itself', async() => {
        const consumer = await client
            .subscribe('a.key', () => {});

        assert.ok(consumer.cancel);
        assert.strictEqual(typeof consumer.cancel, 'function');

        consumer.cancel();

        const ch = await client._asserted();
        assert.ok(ch.cancel.calledOnce);
        assert.strictEqual(ch.cancel.args[0][0], consumer.consumerTag);
    });

    it('should throw when asserted a non-existent exchange', () => {
        client.assert(false).exchange('non.existent');
        return assert.rejects(
            client._asserted,
            (err) => {
                assert.strictEqual(err.code, 404);
                return true;
            });
    });

    it('should throw when asserted a non-existent queue', () => {
        client.assert(false).queue('non.existent');
        return assert.rejects(
            client._asserted,
            (err) => {
                assert.strictEqual(err.code, 404);
                return true;
            });
    });

    it('should handle any exception not handled by consumers', async() => {
        const { consumerTag } = await client.subscribe('a.key', () => {
            throw new Error('test');
        });
        const ch = await client._asserted();
        ch.dispatchMessage({ consumerTag }, {});
    });

    it('should reject when under flow control', async() => {
        const ch = await client._asserted();
        ch.publish = sinon.fake.returns(false);
        return assert.rejects(
            () => client.publish('a.key', Buffer.from('')),
            /flow control/);
    });

    it('should reject when user provided an invalid argument', () => assert.rejects(
        () => client.publish('a.key', null),
        TypeError));
});
