const { Client } = require('../..');
const Retry = require('.');
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

    afterEach(() => client.close());

    it('should retry until it reaches the limit', (done) => {
        let failed = 0;
        client
            .subscribe('it.fails', (msg) => {
                if (msg.content.toString() !== 'hello') {
                    done(new Error('Message does not match'));
                }
                if (failed++ < retries) throw 'fail!';
                else if (failed > 0) done();
            }, { retry: { strategy: 'exponential', base: 1.5 } })
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
            .then(() => {
                done(new Error('RPC call should fail'));
            })
            .catch((err) => {
                if (err.message === 'error!') done();
                else done(new Error('Returned error does not match'));
            });
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
                const headers = err.msg.properties.headers;
                if (err.message === 'error!' &&
                    !('x-retry-count' in headers) &&
                    headers['x-rpc-original-headers']['x-retry-count'] === retries) done();
                else done(new Error('Returned error does not match'));
            })
            .catch(done);
    });
});

