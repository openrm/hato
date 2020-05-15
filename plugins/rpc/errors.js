const { MessageError } = require('../../lib/errors');

const Keys = {
    originalHeaders: 'x-rpc-original-headers',
    error: 'x-rpc-error'
};

const parse = (msg) => {
    return new Promise((resolve, reject) => {
        if (MessageError.is(msg)) {
            const deserialized = JSON.parse(msg.content.toString());
            reject(new MessageError(deserialized, msg));
        }
        else resolve(msg);
    });
};

const extractHeaders = (err) =>
    err.originalHeaders[Keys.originalHeaders] || err.originalHeaders;

const serialize = (err) => {
    if (err instanceof MessageError) {
        const { properties: props } = err.msg;
        return {
            content: Buffer.from(JSON.stringify(err.message)),
            options: {
                ...props,
                headers: {
                    ...err.toHeaders(),
                    [Keys.originalHeaders]: extractHeaders(err),
                    [Keys.error]: true
                },
                contentType: 'application/json'
            }
        };
    }
    return {
        content: Buffer.from(JSON.stringify(err.toString())),
        options: { contentType: 'application/json' }
    };
};

module.exports = { parse, serialize };
