const assert = require('assert');
const { EventEmitter } = require('events');

const { constants: { Scopes } } = require('..');
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
                assert.strictEqual(count, 1);
                done();
            });
    });
});
