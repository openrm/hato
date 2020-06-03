/**
 * Scopes for limiting access by plugins.
 * Mocking const enums in TS.
 *
 * @enum {'connection' | 'channel' | 'publication' | 'subscription' | 'api'}
 */
module.exports.Scopes = {
    CONNECTION: /** @type {'connection'} */ ('connection'),
    CHANNEL: /** @type {'channel'} */ ('channel'),
    PUBLICATION: /** @type {'publication'} */ ('publication'),
    SUBSCRIPTION: /** @type {'subscription'} */ ('subscription'),
    API: /** @type {'api'} */ ('api')
};

/**
 * AMQP exchange types.
 *
 * @readonly
 * @enum {string}
 */
module.exports.ExchangeTypes = {
    FANOUT: 'fanout',
    DIRECT: 'direct',
    TOPIC: 'topic',
    HEADERS: 'headers'
};
