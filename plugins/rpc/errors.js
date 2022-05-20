const { MessageError } = require('../../lib/errors');

const Keys = {
    originalHeaders: 'x-rpc-original-headers',
    error: 'x-rpc-error'
};

const isError = (msg) =>
    MessageError.is(msg) || msg.properties.headers?.[Keys.error];

const extractHeaders = (err) =>
    err.originalHeaders[Keys.originalHeaders] || err.originalHeaders;

const serializeMessageError = (err) => {
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
};

const serialize = (err) => {
    if (err instanceof MessageError) return serializeMessageError(err);
    const content = err instanceof Error ? err.message : err.toString();
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

module.exports = { isError, serialize };
