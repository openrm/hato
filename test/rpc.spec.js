const { Client } = require('../index');

describe('rpc', function() {
    it('should answer to a publish', function(done) {
        const client = new Client('amqp://guest:guest@127.0.0.1:5672', {
            logger: console
        });

        client.start().catch(done);

        client.subscribe('rpc.1', (msg) => {
            msg.ack();
            return 1;
        })
        .catch(done);

        return client.rpc('rpc.1', { 1: 'message' })
            .then(answer => {
                done();
            });

    });
});
