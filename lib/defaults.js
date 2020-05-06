const { ExchangeTypes } = require('./constants');

const defaultExchanges = {
    [ExchangeTypes.FANOUT]: 'amq.fanout',
    [ExchangeTypes.DIRECT]: '', // note that the unnamed exchange is used instead of `amq.direct`
    [ExchangeTypes.TOPIC]: 'amq.topic',
    [ExchangeTypes.HEADERS]: 'amq.headers'
};

module.exports.resolveExchange = (type) => defaultExchanges[type];

module.exports.options = {
    anonymousQueue: { exclusive: true }
};
