const { Client } = require('../index');

describe('rpc', function() {
    let client;
    afterEach(() => client.close());
    it('should answer to a publish', function(done) {
        client = new Client('amqp://guest:guest@127.0.0.1:5672', {
            logger: console
        });

        client.subscribe('rpc.1', (msg) => {
            msg.ack();
            return 1;
        })
        .catch(done);

        client.start()
            .then(() => client.rpc('rpc.1', { 1: 'message' }))
            .then(answer => {
                done();
            })
            .catch(done);
    });
});
