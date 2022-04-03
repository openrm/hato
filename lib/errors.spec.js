const assert = require('assert');

const {
    TimeoutError,
    MessageError,
    BounceError,
    UndeliverableMessageError,
    UnroutableMessageError
} = require('./errors');

describe('errors', () => {
    const message = {
        fields: {
            exchange: '',
            routingKey: 'a.key'
        },
        properties: {
            headers: {}
        },
        content: Buffer.from('')
    };

    [
        [TimeoutError, 100],
        [MessageError, 'test', message],
        [BounceError, 'test', message],
        [UndeliverableMessageError, message],
        [UnroutableMessageError, message]
    ]

        .forEach(([clazz, ...args]) => {
            const err = new clazz(...args);

            it('should have name property set', () => {
                assert.strictEqual(err.name, clazz.name);
            });

            it('should not throw on toString()', () => {
                assert.doesNotThrow(() => err.toString());
            });
        });
});
