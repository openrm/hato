const { Client } = require('..');

describe('client', () => {
    it('should emit \'close\' on connection \'close\'', (done) => {
        const client = new Client();
        client
            .on('close', () => done())
            .start()
            .then(() => client.close())
            .catch(done);
    });
});
