module.exports = createDelayFunc;

const backoff = ({ initial }) => ({
    constant: () => initial,
    linear: (c) => initial * (c + 1),
    exponential: (c, { base = 2 } = {}) => initial * Math.pow(base, c)
});

function createDelayFunc(options) {
    const {
        min = 100,
        max = Infinity,
        strategy = 'exponential',
        ...strategyOptions
    } = options;

    const _delayFn = backoff({ initial: min })[strategy];
    return (count) => {
        const d = _delayFn(count, strategyOptions);
        return Math.min(max, Math.floor(d));
    };
}
