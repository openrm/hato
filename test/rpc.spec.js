const { Client } = require('../index');
const { RPC, Encoding } = require('../plugins');

describe('rpc', function() {
    let client;
    afterEach(() => client.close());
    it('should answer to a publish', function(done) {
        client = new Client('amqp://guest:guest@127.0.0.1:5672', {
            plugins: [
                new Encoding('json'),
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
            .then(answer => {
                if (answer.content === 1) done();
                else done(new Error(`Message does not match ${answer.content} vs. ${1})`));
            })
            .catch(done);
    });
});