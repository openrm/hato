const { Scopes } = require('../lib/constants');

module.exports = class {

    scopes = [Scopes.CONNECTION];

    constructor() {}

    wrap(scope, { logger }) {
        if (scope === Scopes.CONNECTION) {
            return (connect) => (url, socketOptions) => {
                let closing = false;
                return connect(url, socketOptions)
                    .then((conn) => {
                        // handle shutdown signals
                        const close = (sig) => {
                            if (closing) return;
                            closing = true;
                            logger.debug(`[AMQP:graceful] Received ${sig}, closing connection...`);
                            return conn.close().catch(logger.error);
                        };
                        process.once('SIGINT', close);
                        process.once('SIGTERM', close);

                        return conn;
                    });
            }
        } else throw new Error(`Plugin does not implement for scope '${scope}'`);
    }

}
