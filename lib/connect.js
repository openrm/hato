const client = require('./client');

module.exports = connect;

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
                logger.error('[AMQP] Caught connection exception.', err.message);
            });

            return conn;
        });
}
