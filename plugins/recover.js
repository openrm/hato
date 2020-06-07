const EventEmitter = require('events');
const Plugin = require('./base');
const helpers = require('./helpers');
const { Scopes } = require('../lib/constants');
const { TimeoutError } = require('../lib/errors');

class Recoverable extends EventEmitter {

    constructor(conn, create, { logger = console, timeout = 5 * 1e3 } = {}) {
        super();

        this.logger = logger;

        conn.on('close', (err) => {
            if (!err) return;

            this._unbind(conn, 'blocked', 'unblocked', 'error');
            delete this._conn;

            this.logger.info('[AMQP:recover] Attempting to recover the connection...');

            // set timeout for retries
            const timer = setTimeout(() => {
                this.logger.error('[AMQP:recover] Recovery attempt timed out.');
                this._conn = Promise.resolve(null);
                this.emit('close', new TimeoutError(timeout));
            }, timeout);

            this._conn = create()
                .then((conn) => {
                    this.logger.debug('[AMQP:recover] Successfully recovered the connection.');
                    return conn;
                })
                .catch((err) => {
                    this.logger.error('[AMQP:recover] Recovery failed.', err && err.message);
                    this.close(err);
                })
                .then((conn) => {
                    clearTimeout(timer);
                    return conn;
                });
        });

        helpers.events.forward(conn, this, 'blocked', 'unblocked', 'error');
        this._conn = Promise.resolve(conn);
    }

    _unbind(conn, ...events) {
        events.forEach(conn.removeAllListeners.bind(conn));
    }

    close(err) {
        return this._conn
            .then((conn) => conn && conn.close())
            .then(() => {
                this.emit('close', err);
            });
    }

    createChannel() {
        return this._conn.then((conn) => conn.createChannel());
    }

    createConfirmChannel() {
        return this._conn.then((conn) => conn.createConfirmChannel());
    }

}

module.exports = class extends Plugin {

    constructor(options) {
        super();
        this.options = options;
        this.wrappers = {
            [Scopes.CONNECTION](context) {
                return (connect) => (...args) => {
                    const options = Object.assign(context, this.options);
                    return connect(...args)
                        .then((conn) => new Recoverable(conn, () => connect(...args), options));
                };
            }
        };
    }

};
