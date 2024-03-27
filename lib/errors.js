// a semantic error for when an operation is timed out
module.exports.TimeoutError = class TimeoutError extends Error {
    constructor(timeout) {
        super(`Operation timed out after ${timeout}ms`);
        this.name = 'TimeoutError';
    }
};

module.exports.MessageError = class MessageError extends Error {
    constructor(text = '', msg = null) {
        if (typeof text === 'object') msg = text, text = '';
        super(text);
        this.name = 'MessageError';
        if (msg) this.setMessage(msg);
    }
    static is(msg) {
        // eslint-disable-next-line no-console
        console.log(msg);
        return msg.properties.headers?.[MessageError.keys.error] === true;
    }
    static blank() {
        return new MessageError();
    }
    setMessage(msg) {
        if (!this.message) {
            try {
                this.message = JSON.parse(msg.content.toString());
            } catch {
                this.message = msg.content.toString();
            }
        }
        this.msg = msg;
        const {
            fields = {},
            properties: {
                headers: {
                    [MessageError.keys.trace]: trace = [],
                    ...headers
                }
            }
        } = msg;
        this.trace = trace.concat(fields);
        this.originalHeaders = headers;

        return this;
    }
    toString() {
        const {
            exchange,
            routingKey
        } = this.msg.fields;
        return `${this.name} (${exchange === '' ? '<default>' : exchange} -> ${routingKey}): ${this.message}`;
    }
    toHeaders() {
        return {
            [MessageError.keys.error]: true,
            [MessageError.keys.trace]: this.trace
        };
    }
};

module.exports.MessageError.keys = {
    error: 'x-error',
    trace: 'x-error-trace'
};

const BounceError = module.exports.BounceError =
    class BounceError extends module.exports.MessageError {
        constructor(detail, msg) {
            const {
                fields: {
                    replyText = '(unknown)'
                } = {}
            } = msg;
            super(detail, msg);
            this.name = 'BounceError';
            this.code = replyText;
        }
        toString() {
            return `${this.name} [${this.code}]: ${this.message}`;
        }
    };

module.exports.UndeliverableMessageError = class UndeliverableMessageError extends BounceError {
    constructor(msg) {
        super('Message undeliverable immediately.', msg);
        this.name = 'UndeliverableMessageError';
    }
};

module.exports.UnroutableMessageError = class UnroutableMessageError extends BounceError {
    constructor(msg) {
        super('Message unroutable.', msg);
        this.name = 'UnroutableMessageError';
    }
};
