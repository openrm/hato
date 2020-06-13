const { constants: { Scopes } } = require('..');
const { EventEmitter } = require('events');
const GracefulShutdown = require('./graceful');

const conn = new EventEmitter();
const connect = () => Promise.resolve(conn);

describe('graceful plugin', () => {
    it('terminates a connection on process kill', (done) => {
        const plugin = new GracefulShutdown();
        const wrapped = plugin
            .wrap(Scopes.CONNECTION, { logger: console })(connect);
        conn.close = () => {
            done();
            return Promise.resolve();
        };
        wrapped().then(() => process.emit('SIGTERM'));
    });

    it('tries to close the connection only once', (done) => {
        const plugin = new GracefulShutdown();
        const wrapped = plugin
            .wrap(Scopes.CONNECTION, { logger: console })(connect);
        let count = 0;
        conn.close = () => {
            count++;
            return Promise.resolve();
        };
        wrapped()
            .then(() => Promise.race([process.emit('SIGTERM'), process.emit('SIGINT')]))
            .then(() => {
                if (count === 1) done();
                else done(new Error(`Called count should equal 1 but got ${count}`));
            });
    });
});
