module.exports = {

    /**
     * Scopes for limiting access by plugins.
     * @enum {string}
     */
    Scopes: {
        CONNECTION: 'connection',
        CHANNEL: 'channel',
        PUBLICATION: 'publication',
        SUBSCRIPTION: 'subscription',
        API: 'api'
    },

    /**
     * AMQP exchange types.
     * @enum {string}
     */
    ExchangeTypes: {
        FANOUT: 'fanout',
        DIRECT: 'direct',
        TOPIC: 'topic',
        HEADERS: 'headers'
    }

};
