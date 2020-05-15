const { constants: { Scopes } } = require('..');
const ConnectionRetry = require('./conn-retry');

describe('conn-retry plugin', () => {
    const plugin = new ConnectionRetry({ retries: 3, min: 5, base: 1.5 });

    it('should retry connection until it reaches the limit', (done) => {
        const ctx = { logger: console, cancelled: new Promise(() => {}) };
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
        let abort;

        const ctx = { logger: console, cancelled: new Promise((resolve) => abort = resolve) };
        const thrown = new Error('error!');

        let count = 0;
        const connect = () => new Promise((resolve, reject) => {
            count++, setTimeout(() => reject(thrown), 100);
        });

        const retried = plugin
            .wrap(Scopes.CONNECTION, ctx)(connect);

        Promise.race([retried(), abort()])
            .then(() => {
                if (count === 1) done();
                else done(new Error('Attempted after it was aborted'));
            });
    });
});
