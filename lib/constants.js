module.exports = {

    // scopes for limiting access by plugins
    Scopes: {
        CONNECTION: 'connection',
        CHANNEL: 'channel',
        PUBLICATION: 'publication',
        SUBSCRIPTION: 'subscription',
        API: 'api'
    },

    // exchange types in the AMQP spec
    ExchangeTypes: {
        FANOUT: 'fanout',
        DIRECT: 'direct',
        TOPIC: 'topic',
        HEADERS: 'headers'
    }

};
