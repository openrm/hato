const { Client, errors: { UnroutableMessageError } } = require('..');
const Confirm = require('./confirm');

describe('confirm plugin', () => {
    let client;

    beforeEach(() => {
        return new Client('amqp://guest:guest@127.0.0.1:5672', {
            plugins: [new Confirm()]
        })
            .start()
            .then((cli) => client = cli);
    });

    afterEach(() => client.close());

    it('should fail a publish when unroutable', (done) => {
        const opts = { mandatory: true };
        client.publish('non.existent', Buffer.from('hello'), opts)
            .then(() => done(new Error('Unroutable message does not fail')))
            .catch((err) => {
                if (err instanceof UnroutableMessageError) done();
                else done(new Error('Reason does not match'));
            });
    });
});
