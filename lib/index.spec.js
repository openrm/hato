const assert = require('assert');
const { Client } = require('..');

describe('client', () => {
    it('should exit on connection failure', (done) => {
        const client = new Client('amqp://invalid.host');
        client.start()
            .then(() => done(new Error('Connection must fail')))
            .catch((err) => {
                assert.strictEqual(err.cause.code, 'ENOTFOUND');
                done();
            });
    });

    it('should emit \'close\' on connection \'close\'', (done) => {
        const client = new Client();
        client
            .on('close', () => done())
            .start()
            .then(() => client.close())
            .catch(done);
    });
});
