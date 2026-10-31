const assert = require('assert');
const context = require('./context');

describe('retry context', () => {
    const death = (count, overrides = {}) => ({
        exchange: 'delay',
        reason: 'expired',
        count,
        ...overrides
    });

    describe('count', () => {
        it('should be zero without any headers', () => {
            assert.strictEqual(context.count(), 0);
            assert.strictEqual(context.count({}), 0);
        });

        it('should prefer x-retry-count over x-death', () => {
            // RabbitMQ >= 4 resets x-death on every republish
            const headers = { 'x-retry-count': 3, 'x-death': [death(1)] };
            assert.strictEqual(context.count(headers), 3);
        });

        it('should parse a stringified x-retry-count', () => {
            assert.strictEqual(context.count({ 'x-retry-count': '2' }), 2);
        });

        it('should fall back to x-death without x-retry-count', () => {
            const headers = {
                'x-death': [
                    death(2),
                    death(1, { exchange: 'other' }),
                    death(5, { reason: 'rejected' })
                ]
            };
            assert.strictEqual(context.count(headers), 2);
        });

        it('should ignore a malformed x-retry-count', () => {
            const headers = { 'x-retry-count': 'nope', 'x-death': [death(2)] };
            assert.strictEqual(context.count(headers), 2);
        });
    });
});
