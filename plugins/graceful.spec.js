const assert = require('assert');
const sinon = require('sinon');
const { EventEmitter } = require('events');

const { constants: { Scopes } } = require('..');
const GracefulShutdown = require('./graceful');

const conn = new EventEmitter();
const _connect = () => Promise.resolve(conn);

describe('graceful plugin', () => {
    let connect = Promise.resolve;

    beforeEach(() => {
        const plugin = new GracefulShutdown().enable();
        connect = plugin
            .install(Scopes.CONNECTION)(_connect);

        conn.close = sinon.fake.resolves();
    });

    afterEach(() => {
        sinon.restore();
        conn.emit('close');
    });

    it('should terminate the connection on process kill', () => connect()
        .then(() => {
            process.emit('SIGTERM');
            assert.ok(conn.close.called);
        }));

    it('should close the connection only once', () => connect()
        .then(() => {
            process.emit('SIGTERM');
            process.emit('SIGINT');

            assert.ok(conn.close.calledOnce);
        }));

    it('should not call close() after closed', () => {
        const noop = () => {};
        process.on('SIGINT', noop);
        return connect()
            .then(() => {
                conn.emit('close');
                process.emit('SIGINT');

                assert.ok(!conn.close.called);

                process.removeListener('SIGINT', noop);
            });
    });
});
