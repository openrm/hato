const assert = require('assert');
const defs = require('amqplib/lib/defs');
const { Client } = require('..');
const Duplex = require('./duplex');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
describe('duplex plugin', () => {
    let client;
    const logger = { debug() {}, info() {}, warn() {}, error() {} };

    beforeEach(async() => {
        client = await new Client('amqp://guest:guest@127.0.0.1:5672', { logger, plugins: [new Duplex()] }).start();
        client.on('error', () => {});
    });

    afterEach(() => client.close().catch(() => {}));

    // The broker closes a connection that uses a channel it never opened (a channel error), and drops the socket
    // after the close handshake: what happens when a RabbitMQ node goes away, without stopping one here.
    const breakConnection = async() => {
        const conns = await Promise.all(Object.values((await client.conn)._conns));
        conns[1].connection.sendBytes(defs.encodeMethod(defs.ChannelFlow, 77, { active: true }));
    };

    it('should emit close once when the broker closes a connection', async() => {
        await client.queue('', { exclusive: true }).subscribe('duplex.spec', () => {});

        let closes = 0;
        client.on('close', () => closes++);

        await breakConnection();
        await sleep(1500);

        assert.strictEqual(closes, 1);
    });
});
