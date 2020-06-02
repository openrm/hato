// a semantic error for when an operation is timed out
module.exports.TimeoutError = class TimeoutError extends Error {
    constructor(timeout) {
        super(`Operation timed out after ${timeout}ms`);
    }
}

module.exports.MessageError = class MessageError extends Error {
    constructor(text, msg) {
        super(text);
        const {
            fields,
            properties: {
                headers: {
                    [MessageError.keys.trace]: trace = [],
                    ...headers
                }
            }
        } = this.msg = msg;
        this.trace = trace.concat(fields);
        this.originalHeaders = headers;
    }
    static is(msg) {
        return msg.properties.headers[MessageError.keys.error] === true;
    }
    toHeaders() {
        return {
            [MessageError.keys.error]: true,
            [MessageError.keys.trace]: this.trace
        };
    }
}

module.exports.MessageError.keys = {
    error: 'x-error',
    trace: 'x-error-trace'
};

class BounceError extends module.exports.MessageError {
    constructor(detail, msg) {
        const {
            fields: {
                exchange = '(unknown)',
                replyText = '(unknown)',
                routingKey = '(unknown)'
            } = {}
        } = msg || {};
        const ex = exchange === '' ? '(default)' : exchange;
        super(`${detail} Code: ${replyText}, Exchange: ${ex}, Routing Key: ${routingKey}`, msg);
    }
}

module.exports.BounceError = BounceError;

module.exports.UndeliverableMessageError = class UndeliverableMessageError extends BounceError {
    constructor(msg) {
        super('Message undeliverable immediately:', msg);
    }
}

module.exports.UnroutableMessageError = class UnroutableMessageError extends BounceError {
    constructor(msg) {
        super('Message unroutable:', msg);
    }
}
