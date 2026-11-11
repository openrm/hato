const assert = require('assert');
const { Client } = require('..');
const amqplib = require('amqplib');
const { Encoding, GracefulShutdown, RPC, Retry } = require('../plugins');

const URL = 'amqp://guest:guest@127.0.0.1:5672';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const unique = (name) => `hato.graceful.${name}.${process.pid}.${Date.now()}`;

describe('graceful shutdown: drain', function() {
    this.timeout(10000);

    const clients = [];
    const start = async(plugins) => {
        const client = await Client.start(URL, { plugins });
        clients.push(client);
        return client;
    };

    afterEach(async() => {
        await Promise.all(clients.splice(0).map((client) => client.close().catch(() => {})));
    });

    it('stops taking messages, and lets the one in progress finish and be acknowledged', async() => {
        const plugin = new GracefulShutdown({ drain: { timeout: 5000 } });
        const client = await start([plugin, new Encoding('json')]);

        const queue = unique('queue');
        const key = unique('key');
        const received = [];
        let finished = false;

        // exclusive, not autoDelete: the broker would delete the queue when its last consumer is cancelled
        await client.type('direct').queue(queue, { exclusive: true })
            .subscribe(key, async(msg) => {
                received.push(msg.content.n);
                await sleep(300);
                msg.ack();
                finished = true;
            });

        await client.type('direct').publish(key, { n: 1 });
        while (!received.length) await sleep(10);
        assert.strictEqual(plugin.inflight, 1);

        await plugin.stopConsuming();
        await client.type('direct').publish(key, { n: 2 });
        await sleep(200);

        assert.deepStrictEqual(received, [1], 'a message was delivered after the consumer was cancelled');
        assert.strictEqual(finished, false);

        assert.strictEqual(await plugin.drain(), true);
        assert.strictEqual(finished, true, 'drain() returned before the handler had finished');
        assert.strictEqual(plugin.inflight, 0);

        // the first message is acknowledged, the second one waits for the next consumer
        const ch = await client._asserted();
        const { messageCount, consumerCount } = await ch.checkQueue(queue);
        assert.strictEqual(consumerCount, 0);
        assert.strictEqual(messageCount, 1);
    });

    // Acknowledging a message and then closing the connection loses the acknowledgement: the broker requeues the
    // message, and it is processed again. The channels have to be closed first. (Through the signal path: that is
    // where the connection is closed.)
    it('does not lose the acknowledgement of a message that finishes while shutting down', async() => {
        const plugin = new GracefulShutdown(); // the defaults: drain, and the signals
        const client = await start([plugin, new Encoding('json')]);

        const queue = unique('ack');
        let started = false;
        let acked = false;

        await client.type('direct').queue(queue, { autoDelete: false })
            .subscribe(queue, async(msg) => {
                started = true;
                await sleep(200);
                msg.ack();
                acked = true;
            });

        await client.type('direct').publish(queue, { n: 1 });
        while (!started) await sleep(5);

        const closed = new Promise((resolve) => client.on('close', resolve));
        process.emit('SIGTERM');
        await closed;
        assert.strictEqual(acked, true, 'the connection was closed before the handler had finished');

        const conn = await amqplib.connect(URL);
        const ch = await conn.createChannel();
        try {
            const { messageCount } = await ch.checkQueue(queue);
            assert.strictEqual(messageCount, 0, 'the message came back: its acknowledgement was lost');
        } finally {
            await ch.deleteQueue(queue).catch(() => {});
            await conn.close();
        }
    });

    // The point of tracking every handler in _consume(): the retry plugin does most of its work after the
    // user's function has thrown (it declares a delay queue, republishes the message, acknowledges the original).
    // A tracker that only wrapped the user's function let drain() return in the middle of that, and the
    // connection was closed under it: the broker then redelivered the original message at once, without delay or
    // retry count.
    it('lets a retry that is being scheduled complete before the connection is closed', async() => {
        const plugin = new GracefulShutdown({ drain: true });
        // last in the list: the outermost layer, which is handed the function of the user only
        const server = await start([
            new Encoding('json'), new Retry({ strategy: 'constant', min: 300, retries: 3 }), plugin
        ]);

        const queue = unique('retry');
        let started = false;

        await server.type('direct').queue(queue, { autoDelete: false })
            .subscribe(queue, async() => {
                started = true;
                await sleep(100);
                throw new Error('fails, to be retried');
            })
            .on('error', () => {});

        await server.type('direct').publish(queue, { n: 1 });
        while (!started) await sleep(5);

        await plugin.stopConsuming();
        await plugin.drain();
        await server.close();

        // what the next consumer gets: a message scheduled by the retry plugin has its count, one that was
        // cut off is the original, redelivered
        const next = await start([new Encoding('json')]);
        try {
            const msg = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('no message within 3s')), 3000);
                next.type('direct').queue(queue, { autoDelete: false }).subscribe(queue, (msg) => {
                    clearTimeout(timer);
                    msg.ack();
                    resolve(msg);
                });
            });

            assert.strictEqual(msg.properties.headers['x-retry-count'], 1);
            assert.strictEqual(msg.fields.redelivered, false);
        } finally {
            await next.close();
            const conn = await amqplib.connect(URL);
            await (await conn.createChannel()).deleteQueue(queue).catch(() => {});
            await conn.close();
        }
    });

    it('still delivers the reply of an rpc handler that finishes while draining', async() => {
        const plugin = new GracefulShutdown({ drain: true });
        const server = await start([plugin, new Encoding('json'), new RPC({ timeout: 5000 })]);
        const caller = await start([new Encoding('json'), new RPC({ timeout: 5000 })]);

        const key = unique('rpc');
        let started = false;

        await server.type('direct').queue(unique('rpc.queue'), { autoDelete: true })
            .subscribe(key, async() => {
                started = true;
                await sleep(300);
                return { answer: 42 };
            });

        const call = caller.type('direct').rpc(key, {});
        while (!started) await sleep(10);

        // what a shutdown does, then the connection is closed: the caller still has to get its answer
        await plugin.stopConsuming();
        assert.strictEqual(await plugin.drain(), true);
        await server.close();

        const { content } = await call;
        assert.deepStrictEqual(content, { answer: 42 });
    });

    it('does not cancel the reply queue of rpc calls made by the messages in progress', async() => {
        // the defaults: drain on, with the signals left to the application
        const plugin = new GracefulShutdown({ signals: false });
        const service = await start([plugin, new Encoding('json'), new RPC({ timeout: 5000 })]);
        const downstream = await start([new Encoding('json'), new RPC({ timeout: 5000 })]);

        const downstreamKey = unique('downstream');
        const key = unique('upstream');
        let started = false;

        await downstream.type('direct').queue(unique('downstream.queue'), { autoDelete: true })
            .subscribe(downstreamKey, async() => {
                await sleep(300);
                return { from: 'downstream' };
            });

        // the handler in progress calls another service, and needs the answer to finish
        await service.type('direct').queue(unique('upstream.queue'), { autoDelete: true })
            .subscribe(key, async() => {
                started = true;
                const { content } = await service.type('direct').rpc(downstreamKey, {});
                return { relayed: content };
            });

        const call = downstream.type('direct').rpc(key, {});
        while (!started) await sleep(10);

        await plugin.stopConsuming();

        const { content } = await call;
        assert.deepStrictEqual(content, { relayed: { from: 'downstream' } });
        assert.strictEqual(await plugin.drain(), true);
    });
});
