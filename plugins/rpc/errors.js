const { MessageError } = require('../../lib/errors');

const Keys = {
    originalHeaders: 'x-rpc-original-headers',
    error: 'x-rpc-error'
};

const parse = (msg) => new Promise((resolve, reject) => {
    if (MessageError.is(msg) ||
        msg.properties.headers[Keys.error]) {
        const deserialized = JSON.parse(msg.content.toString());
        reject(new MessageError(deserialized, msg));
    } else resolve(msg);
});

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
    let content = err.toString();
    if (err instanceof Error) content = err.message;
    return {
        content: Buffer.from(JSON.stringify(content)),
        options: {
            headers: {
                [Keys.error]: true
            },
            contentType: 'application/json'
        }
    };
};

module.exports = { parse, serialize };
