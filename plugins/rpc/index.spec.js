const { Client, errors: { TimeoutError } } = require('../..');
const RPC = require('../rpc');

describe('rpc plugin', () => {
    let client;

    beforeEach(() => new Client('amqp://guest:guest@127.0.0.1:5672', {
        plugins: [
            new RPC()
        ]
    }).start()
        .then((cli) => client = cli));

    afterEach(() => client.close());

    it('should timeout after specified duration', (done) => {
        client
            .subscribe('rpc.1', () => new Promise((resolve) => {
                setTimeout(() => resolve(Buffer.from('hi')), 100);
            }))
            .then(() => client.rpc('rpc.1', Buffer.from('hello'), { timeout: 10 }))
            .then(() => done(new Error('RPC call should fail')))
            .catch((err) => {
                if (err instanceof TimeoutError) done();
                else done(err);
            });
    });

    it('should but succeed with shorter timeout', (done) => {
        client
            .subscribe('rpc.1', () => Buffer.from('hi'))
            .then(() => client.rpc('rpc.1', Buffer.from('hello'), { timeout: 100 }))
            .then(() => done())
            .catch(done);
    });
});
