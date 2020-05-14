// a semantic error for when an operation is timed out
class TimeoutError extends Error {
    constructor(timeout) {
        super(`Operation timed out after ${timeout}ms`);
    }
}

class MessageError extends Error {
    constructor(text, msg) {
        super(text);
        this.msg = msg;
    }
}

class BounceError extends MessageError {
    constructor(detail, msg) {
        const { fields: { replyText, exchange, routingKey } = {} } = msg || {};
        const ex = exchange === '' ? '(default)' : exchange;
        super(`${detail} Code: ${replyText}, Exchange: ${ex}, Routing Key: ${routingKey}`, msg);
    }
}

class UndeliverableMessageError extends BounceError {
    constructor(msg) {
        super('Message undeliverable immediately:', msg);
    }
}

class UnroutableMessageError extends BounceError {
    constructor(msg) {
        super('Message unroutable:', msg);
    }
}

module.exports = {
    MessageError,
    TimeoutError,
    UnroutableMessageError,
    UndeliverableMessageError,
    isFatal: require('./client').isFatalError
};
