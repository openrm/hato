const EventEmitter = require('events');
const Plugin = require('./base');
const { Scopes } = require('../lib/constants');

const timer = (timeout) => new Promise((resolve, reject) =>
    setTimeout(() => reject(new Error(`Reconnection timed out after ${timeout}ms`)), timeout));

class Recoverable extends EventEmitter {

    constructor(conn, create, { logger, timeout = 5 * 1e3 } = {}) {
        super();

        this.logger = logger;

        conn.on('close', (err) => {
            if (!err) return;

            this._unbind(conn, 'blocked', 'unblocked', 'error');
            delete this._conn;

            this._conn = Promise.race([
                create(),
                timer(timeout)
            ]).catch((err) => {
                this.logger.error('[AMQP:recover] Recovery failed.', err.message);
                this.emit('close', err);
                // TODO(naggingant) should abort all attempts initiated
            });
        });

        this._bind(conn, 'blocked', 'unblocked', 'error');
        this._conn = Promise.resolve(conn);
    }

    _bind(conn, ...events) {
        events.forEach(eventName => {
            conn.on(eventName, this.emit.bind(this, eventName));
        });
    }

    _unbind(conn, ...events) {
        events.forEach(conn.removeAllListeners.bind(conn));
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
    }

    wrappers = {
        [Scopes.CONNECTION]({ logger }) {
            return (connect) => (...args) => {
                const options = Object.assign({ logger }, this.options);
                return connect(...args)
                    .then((conn) => new Recoverable(conn, connect.bind(conn, ...args), options));
            }
        }
    }

}
