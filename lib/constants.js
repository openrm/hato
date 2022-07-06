/**
 * Scopes for limiting access by plugins.
 * Mocking const enums in TS.
 */
module.exports.Scopes = {
    CONNECTION: 'connection',
    CHANNEL: 'channel',
    PUBLICATION: 'publication',
    SUBSCRIPTION: 'subscription',
    API: 'api'
};

/**
 * AMQP exchange types.
 */
module.exports.ExchangeTypes = {
    FANOUT: 'fanout',
    DIRECT: 'direct',
    TOPIC: 'topic',
    HEADERS: 'headers'
};
