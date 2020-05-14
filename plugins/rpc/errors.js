const { MessageError } = require('../../lib/errors');

const Keys = {
    originalHeaders: 'x-rpc-original-headers',
    error: 'x-rpc-error'
};

const parse = (msg) => {
    return new Promise((resolve, reject) => {
        const { properties: { headers } } = msg;
        if (headers['x-error']) {
            const deserialized = JSON.parse(msg.content.toString());
            reject(new MessageError(deserialized, msg));
        }
        else resolve(msg);
    });
};

const serialize = (err) => {
    const headers = { 'x-error': true };
    if (err instanceof MessageError) {
        const { properties: props } = err.msg;
        const originalHeaders = props.headers[Keys.originalHeaders] || props.headers;
        return {
            content: Buffer.from(JSON.stringify(err.message)),
            options: {
                ...props,
                headers: {
                    ...headers,
                    [Keys.originalHeaders]: originalHeaders,
                    [Keys.error]: true
                },
                contentType: 'application/json'
            }
        };
    }
    return {
        content: Buffer.from(JSON.stringify(err.toString())),
        options: { headers, contentType: 'application/json' }
    };
};

module.exports = { parse, serialize };
