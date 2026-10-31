const configs = require('./configs');

const inject = (delay, exchange) => (headers) => ({
    ...headers,
    'retry-destination': exchange,
    'retry-delay': delay
});

const count = (headers = {}) => {
    // RabbitMQ >= 4 drops client-provided x-death on publish, so x-death
    // cannot accumulate across republishes; prefer our own counter.
    const retried = parseInt(headers['x-retry-count']);
    if (!isNaN(retried)) return retried;

    const deaths = headers['x-death'] || [];
    const { name } = configs.exchange();
    return deaths
        .filter(({ exchange, reason }) =>
            exchange === name && reason === 'expired')
        .reduce((c, { count }) => c + count, 0);
};

module.exports = { inject, count };
