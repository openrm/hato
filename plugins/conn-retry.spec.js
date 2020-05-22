const { constants: { Scopes } } = require('..');
const ConnectionRetry = require('./conn-retry');

describe('conn-retry plugin', () => {
    const plugin = new ConnectionRetry({ retries: 3, min: 5, base: 1.5 });

    it('should retry connection until it reaches the limit', (done) => {
        const ctx = { logger: console };
        const thrown = new Error('error!');

        let count = 0;
        const connect = () => new Promise((resolve, reject) => {
            count++, setImmediate(() => reject(thrown));
        });

        const retried = plugin
            .wrap(Scopes.CONNECTION, ctx)(connect);

        retried()
            .catch((err) => {
                if (count === 3 && err === thrown) done();
                else done(err);
            });
    });

    it('should abort retries when told so', (done) => {
        const ctx = { logger: console };
        const err = new Error('error!');

        let count = 0;
        const connect = () => new Promise((resolve, reject) => {
            setTimeout(() => {
                reject(err);
                if (count++ > 0) setImmediate(() => plugin.destroy());
            }, 1);
        });

        const retried = plugin
            .wrap(Scopes.CONNECTION, ctx)(connect);

        retried().then(() => {
            done(new Error('Connection should always fail'));
        }).catch(done);

        setTimeout(() => {
            if (count === 2) done();
            else done(new Error('Attempted after it was aborted'));
        }, 30);
    });
});
