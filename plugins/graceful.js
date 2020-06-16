const Plugin = require('./base');
const { Scopes } = require('../lib/constants');

module.exports = class someClass extends Plugin {

    constructor() {
        super('graceful');
    }

    init() {
        this.scopes[Scopes.CONNECTION] = (connect) =>
            (url, socketOptions) => {
                let closing = false;
                return connect(url, socketOptions)
                    .then((conn) => {
                        // Handle shutdown signals
                        const close = (sig) => {
                            if (closing) return;
                            closing = true;
                            this.logger.debug(
                                `[AMQP:graceful] Received ${sig}, closing connection...`);
                            return conn.close().catch(this.logger.error);
                        };

                        process.once('SIGINT', close);
                        process.once('SIGTERM', close);

                        conn.on('close', () => {
                            process.removeListener('SIGINT', close);
                            process.removeListener('SIGTERM', close);
                        });

                        return conn;
                    });
            };
    }

};
