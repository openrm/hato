const { Client } = require('..');
const Retry = require('./retry');

describe('retry plugin', () => {
    let client;
    const retries = 2;

    beforeEach(() => {
        return new Client('amqp://guest:guest@127.0.0.1:5672', {
            plugins: [new Retry({ retries: 2 })]
        })
            .start()
            .then((cli) => client = cli);
    });

    afterEach(() => client.close());

    it('should retry until it reaches the limit', (done) => {
        let failed = 0;
        client
            .subscribe('it.fails', () => {
                if (failed++ < retries) throw 'fail!';
                else if (failed > 0) done();
            })
            .then(() => client
                .publish('it.fails', Buffer.from('hello')))
            .catch(done);
    });
});

