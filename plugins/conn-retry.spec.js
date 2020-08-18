const assert = require('assert');
const { constants: { Scopes } } = require('..');
const ConnectionRetry = require('./conn-retry');

describe('conn-retry plugin', () => {
    const plugin = new ConnectionRetry({ retries: 3, min: 5, base: 1.5 });

    it('should retry connection until it reaches the limit', (done) => {
        const thrown = new Error('error!');

        let count = 0;
        const connect = () => new Promise((resolve, reject) => {
            count++;
            setImmediate(() => reject(thrown));
        });

        const retried = plugin
            .enable()
            .install(Scopes.CONNECTION)(connect);

        retried()
            .catch((err) => {
                assert.strictEqual(count, 3);
                assert.strictEqual(err, thrown);
                done();
            })
            .catch(done);
    });

    it('should abort the retry process on process kill', function(done) {
        const thrown = new Error('error!');
        let count = 0;
        const connect = () => new Promise((resolve, reject) => {
            if (count++ === 0) {
                setImmediate(() => reject(thrown));
                process.emit('SIGINT');
            }
        });

        const plugin = new ConnectionRetry({ retries: 3, min: 5, base: 250 }).enable();
        const retriedConnect = plugin.install(Scopes.CONNECTION)(connect);

        assert.rejects(retriedConnect, (err) => {
            assert.strictEqual(count, 1);
            assert.strictEqual(err.message, 'Retries halted');
            done();
            return true;
        });
    });

    it('should abort retries when told so', (done) => {
        const err = new Error('error!');

        let count = 0;
        const connect = () => new Promise((resolve, reject) => {
            setTimeout(() => {
                reject(err);
                if (count++ > 0) setImmediate(() => plugin.destroy());
            }, 1);
        });

        const retried = plugin
            .enable()
            .install(Scopes.CONNECTION)(connect);

        retried()
            .then(() => {
                done(new Error('Connection should always fail'));
            })
            .catch(done);

        setTimeout(() => {
            assert.strictEqual(count, 2);
            done();
        }, 30);
    });
});
