const client = require('./client');

module.exports = connect;

function logChannel(conn, name) {
    const logger = this.logger;
    const create = conn[name];
    return conn[name] = function() {
        logger.debug('[AMQP] Opening a channel...');
        const open = create.apply(conn, arguments);
        return Promise.resolve(open)
            .then((ch) => {
                const label = `Channel ${ch.ch}`;
                logger.debug(`[AMQP] ${label} opened.`);

                ch.on('close', () => {
                    logger.warn(`[AMQP] ${label} closed.`);
                });

                ch.on('error', (err) => {
                    logger.error(`[AMQP] Caught an exception on ${label}`, err.message);
                });

                return ch;
            });
    }
}

function connect(url, socketOptions) {
    const logger = this.logger;
    logger.debug('[AMQP] Connecting to server...');
    return client
        .connect(url, socketOptions)
        .then((conn) => {
            logger.debug(`[AMQP] Connection established.`);

            conn.on('close', (err) => {
                if (!err) return logger.debug('[AMQP] Connection closed.');

                if (client.isFatalError(err)) {
                    logger.error('[AMQP] Connection experienced a fatal error:', err.message);
                }

                else logger.error('[AMQP] Connection shut down:', err.message);
            });

            conn.on('blocked', reason => {
                logger.warn('[AMQP] Connection blocked.', reason);
            });

            conn.on('unblocked', () => {
                logger.info('[AMQP] Connection unblocked.');
            });

            conn.on('error', (err) => {
                logger.error('[AMQP] Caught a connection exception.', err.message);
            });

            logChannel.call(this, conn, 'createChannel');
            logChannel.call(this, conn, 'createConfirmChannel');

            return conn;
        })
        .catch((err) => {
            logger.error('[AMQP] Connection failed.', err.message);
            throw err;
        });
}
