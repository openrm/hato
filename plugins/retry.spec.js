const { Client } = require('..');
const Retry = require('./retry');
const RPC = require('./rpc');

describe('retry plugin', () => {
    let client;
    const retries = 2;

    beforeEach(() => {
        return new Client('amqp://guest:guest@127.0.0.1:5672', {
            plugins: [
                new Retry({ retries: 2, min: 10 }),
                new RPC()
            ]
        })
            .start()
            .then((cli) => client = cli);
    });

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
            .then(() => client
                .rpc('rpc.1', Buffer.from('hello')))
            .then(() => {
                done(new Error('RPC call should fail'));
            })
            .catch((err) => {
                if (err.message === 'error!') done();
                else done(new Error('Returned error does not match'));
            });
    });
});

