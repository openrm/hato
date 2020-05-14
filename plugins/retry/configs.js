module.exports = {
    exchange: () => ({
        name: 'delay',
        type: 'headers',
        options: { durable: true }
    }),
    queue: ({ delay = 500, exchange = '' } = {}) => ({
        name: `delay.${delay}.${exchange}`,
        options: {
            durable: true,
            deadLetterExchange: exchange,
            expires: 60 * 60 * 1e3,
            messageTtl: delay
        }
    })
};
