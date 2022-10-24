//
// Imports
//

const amqp = require('amqplib');
// @ts-ignore
const { isFatalError } = require('amqplib/lib/connection');


//
// Utils
//

const promisify = (bound) => Promise.resolve().then(bound);


//
// Functions
//

/**
 * Patch amqp.createChannel().
 */
const patchChannel = function(logger, conn, create) {
    return function() {
        logger.debug('[AMQP] Opening a channel...');
        return promisify(create.bind(conn))
            .then((ch) => {
                const close = ch.close;
                ch.close = function() {
                    const tags = ch.consumers instanceof Map ?
                        [...ch.consumers.keys()] : Object.keys(ch.consumers);
                    const cancelling = Promise.all(
                        tags.map((tag) =>
                            promisify(ch.cancel.bind(ch, tag))));
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
 */
const connect = function(url, socketOptions) {
    const logger = this.logger;
    logger.debug('[AMQP] Connecting to server...');
    return promisify(amqp.connect.bind(amqp, url, socketOptions))
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

            conn.createChannel =
                patchChannel(this.logger, conn, conn.createChannel);
            conn.createConfirmChannel =
                patchChannel(this.logger, conn, conn.createConfirmChannel);

            return conn;
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
