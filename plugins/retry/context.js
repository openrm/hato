const configs = require('./configs');

const inject = (delay, exchange) => (headers) => ({
    ...headers,
    'retry-destination': exchange,
    'retry-delay': delay
});

const count = (headers) => {
    const deaths = headers['x-death'] || [];
    const { name } = configs.exchange();
    return deaths
        .filter(({ exchange, reason }) =>
            exchange === name && reason === 'expired')
        .reduce((c, { count }) => c + count, 0);
};

module.exports = { inject, count };
