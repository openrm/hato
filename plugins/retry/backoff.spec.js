const assert = require('assert');
const createDelayFunc = require('./backoff');

describe('backoff', () => {
    const counts = [...new Array(5).keys()];

    it('should compute constant delays', () => {
        const compute = createDelayFunc({
            strategy: 'constant',
            min: 4
        });
        const delays = counts.map(compute);
        assert.deepStrictEqual(delays, [4, 4, 4, 4, 4]);
    });

    it('should compute linear delays', () => {
        const compute = createDelayFunc({
            strategy: 'linear',
            min: 1,
            max: 3
        });
        const delays = counts.map(compute);
        assert.deepStrictEqual(delays, [1, 2, 3, 3, 3]);
    });

    it('should compute exponential delays', () => {
        const compute = createDelayFunc({
            strategy: 'exponential',
            min: 1,
            base: 2,
            max: 7
        });
        const delays = counts.map(compute);
        assert.deepStrictEqual(delays, [1, 2, 4, 7, 7]);
    });
});
