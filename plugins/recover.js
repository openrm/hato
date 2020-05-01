const EventEmitter = require('events');
const Plugin = require('./base');
const { Scopes } = require('../lib/constants');
const { TimeoutError } = require('../lib/errors');

class Recoverable extends EventEmitter {

    constructor(conn, create, { logger, cancel, timeout = 5 * 1e3 } = {}) {
        super();

        this.logger = logger;

        conn.on('close', (err) => {
            if (!err) return;

            this._unbind(conn, 'blocked', 'unblocked', 'error');
            delete this._conn;

            // set timeout for retries
            setTimeout(() => cancel(new TimeoutError(timeout)), timeout);

            this._conn = create().catch((err) => {
                this.logger.error('[AMQP:recover] Recovery failed.', err.message);
                this.emit('close', err);
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
        [Scopes.CONNECTION](context) {
            return (connect) => (...args) => {
                const options = Object.assign(context, this.options);
                return connect(...args)
                    .then((conn) => new Recoverable(conn, connect.bind(conn, ...args), options));
            }
        }
    }

}
