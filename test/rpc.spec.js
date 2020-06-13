const assert = require('assert');
const { Client } = require('../index');
const { RPC, Duplex, Encoding } = require('../plugins');

describe('rpc', function() {
    let client;
    afterEach(() => client.close());
    it('should answer to a publish', function(done) {
        client = new Client('amqp://guest:guest@127.0.0.1:5672', {
            plugins: [
                new Encoding('json'),
                new Duplex(),
                new RPC()
            ]
        });

        client.subscribe('rpc.1', (msg) => {
            msg.ack();
            return 1;
        })
        .catch(done);

        client.start()
            .then(() => client.rpc('rpc.1', { 1: 'message' }))
            .then((answer) => {
                assert.strictEqual(answer.content, 1);
                done();
            })
            .catch(done);
    });
    it('should form a chain of calls', function(done) {
        client = new Client('amqp://guest:guest@127.0.0.1:5672', {
            plugins: [
                new Encoding('json'),
                new RPC()
            ]
        });

        client.subscribe('rpc.1', (msg) => {
            msg.ack();
            return ++msg.content;
        }).catch(done);

        client.subscribe('rpc.2', async (msg) => {
            msg.ack();
            const reply = await client.rpc('rpc.1', ++msg.content)
            return ++reply.content;
        }).on('error', done)
            .catch(done);

        client.start()
            .then(() => client.rpc('rpc.2', 0))
            .then((answer) => {
                assert.strictEqual(answer.content, 3);
                done();
            })
            .catch(done);
    });
    it('should reply properly to a direct call', function(done) {
        client = new Client('amqp://guest:guest@127.0.0.1:5672', {
            plugins: [
                new Encoding('json'),
                new RPC()
            ]
        });

        client.type('direct').subscribe('rpc.1', (msg) => {
            msg.ack();
            return 1;
        })
        .catch(done);

        client.start()
            .then(() => client.type('direct').rpc('rpc.1', { 1: 'message' }))
            .then((answer) => {
                assert.strictEqual(answer.content, 1);
                done();
            })
            .catch(done);
    });
});
