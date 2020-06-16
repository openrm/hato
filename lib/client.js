//
// Imports
//

const amqp = require('amqplib');
// @ts-ignore
const { isFatalError } = require('amqplib/lib/connection');


//
// Types
//

/**
 * @template T, U
 * @typedef {Pick<T, Exclude<keyof T, keyof U>> & U} Override
 */
/**
 * @typedef {import('events').EventEmitter} EventEmitter
 * @typedef {{
 *   ch: number,
 *   consumers: { [tag: string]: Function },
 *   consume: (...args: Parameters<import('amqplib').Channel['consume']>) => Promise<import('amqplib').Replies.Consume>,
 *   close: () => Promise<void>
 * }} WrappedChannel
 * @typedef {Omit<import('amqplib').Channel, 'consume' | 'close'> & WrappedChannel} Channel
 * @typedef {Omit<import('amqplib').ConfirmChannel, 'consume' | 'close'> & WrappedChannel} ConfirmChannel
 * @typedef {import('amqplib').Options.Connect} ConnectOptions
 *
 * @typedef {import('events').EventEmitter & {
 *   close: () => Promise<any>,
 *   createChannel: () => Promise<Channel>,
 *   createConfirmChannel: () => Promise<ConfirmChannel>,
 * }} Connection
 *
 * @typedef {Parameters<connect>} ConnectParams
 * @typedef {Parameters<Connection['createChannel']>} CreateChannelParams
 * @typedef {Parameters<Channel['publish']>} PublishParams
 * @typedef {Parameters<Channel['consume']>} SubscribeParams
 *
 * @typedef {import('./types').Logger} Logger
 */


//
// Functions
//

/**
 * Patch amqp.createChannel().
 *
 * @template {Channel | ConfirmChannel} T
 * @param {Logger} logger
 * @param {Connection} conn
 * @param {() => Promise<T>} create
 * @return {() => Promise<T>}
 */
const patchChannel = function(logger, conn, create) {
    return function() {
        logger.debug('[AMQP] Opening a channel...');
        const open = create.call(conn);
        return Promise.resolve(open)
            .then((ch) => {
                const close = ch.close;
                ch.close = function() {
                    const cancelling = Promise.all(
                        Object.keys(ch.consumers).map((tag) => ch.cancel(tag)));
                    return cancelling.then(() => close.call(ch));
                };
                return ch;
            })
            .then((ch) => {
                const label = `Channel ${ch.ch}`;

                logger.debug(`[AMQP] ${label} opened.`);

                ch.on('close', () => {
                    logger.warn(`[AMQP] ${label} closed.`);
                });

                ch.on('error', (err) => {
                    logger.error(
                        `[AMQP] Caught an exception on ${label.toLowerCase()}:`,
                        err.message);
                });

                ch.on('return', (msg) => {
                    logger.debug(
                        '[AMQP] A message was returned from the broker. Reply text:',
                        msg.fields.replyText);
                });

                return ch;
            });
    };
};

/**
 * Logged amqp.connect().
 *
 * @this {{ logger: Logger }}
 * @param {string | ConnectOptions} url
 * @param {object} [socketOptions]
 * @return {Promise<Connection>}
 */
const connect = function(url, socketOptions) {
    const logger = this.logger;
    logger.debug('[AMQP] Connecting to server...');
    const open = amqp.connect(url, socketOptions);
    return Promise.resolve(open)
        .then((conn) => {
            logger.debug('[AMQP] Connection established.');

            conn.on('close', (err) => {
                if (!err) return logger.debug('[AMQP] Connection closed.');

                if (isFatalError(err)) {
                    logger.error(
                        '[AMQP] Connection experienced a fatal error:',
                        err.message);
                } else logger.error('[AMQP] Connection shut down:', err.message);
            });

            conn.on('blocked', (reason) => {
                logger.warn('[AMQP] Connection blocked.', reason);
            });

            conn.on('unblocked', () => {
                logger.info('[AMQP] Connection unblocked.');
            });

            conn.on('error', (err) => {
                logger.error(
                    '[AMQP] Caught a connection exception.',
                    err.message);
            });

            const _conn = /** @type {Connection} */ (conn);

            _conn.createChannel =
                patchChannel(this.logger, _conn, _conn.createChannel);
            _conn.createConfirmChannel =
                patchChannel(this.logger, _conn, _conn.createConfirmChannel);

            return _conn;
        })
        .catch((err) => {
            logger.error('[AMQP] Connection failed.', err.message);
            throw err;
        });
};


//
// Exports
//

module.exports = {
    connect,
    isFatalError
};
