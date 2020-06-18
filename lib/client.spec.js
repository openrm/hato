const assert = require('assert');
const sinon = require('sinon');
const { connect } = require('./client');

describe('patch', () => {
    const logger = console;
    let conn;

    beforeEach(async() => {
        sinon.spy(logger);
        conn = await connect.call({ logger });
    });

    afterEach(() => {
        sinon.restore();
        conn.close();
    });

    it('should log flow control events', () => {
        conn.emit('blocked');
        assert.ok(logger.warn.calledOnce);
        conn.emit('unblocked');
        assert.ok(logger.info.calledOnce);
    });

    it('should log when connection force closed', () => {
        conn.emit('error', { code: 302, message: 'closed by server' });

        assert.ok(logger.error.calledOnce);
        const [, message] = logger.error.args[0];
        assert.strictEqual(message, 'closed by server');
    });

    it('should log message of thrown error', () => {
        conn.emit('error', new Error('test'));

        assert.ok(logger.error.calledOnce);
        const [, message] = logger.error.args[0];
        assert.strictEqual(message, 'test');
    });

    it('should select severity to presence of error', () => {
        const c = logger.debug.callCount;
        conn.emit('close', 0);
        assert.strictEqual(logger.debug.callCount, c + 1);
        assert.ok(!logger.error.called);

        conn.emit('close', new Error());
        assert.ok(logger.error.calledOnce);
    });

    it('should log channel errors', async() => {
        const ch = await conn.createChannel();
        ch.emit('error', new Error('test'));
        assert.ok(logger.error.calledOnce);

        const [, message] = logger.error.args[0];
        assert.strictEqual(message, 'test');
    });

    it('should cancel consumers on closing', async() => {
        const ch = await conn.createChannel();
        sinon.spy(ch, 'cancel');

        const { queue } = await ch.assertQueue('', { exclusive: true });
        const { consumerTag: tag1 } = await ch.consume(queue, () => {});
        const { consumerTag: tag2 } = await ch.consume(queue, () => {});
        await ch.close();

        assert.ok(ch.cancel.calledTwice);
        const args = ch.cancel.args.map(([tag]) => tag);
        assert.strictEqual(args.length, 2);
        assert.ok(args.includes(tag1));
        assert.ok(args.includes(tag2));
    });
});
