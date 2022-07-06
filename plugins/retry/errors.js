const { MessageError } = require('../../lib/errors');

class RetryError extends MessageError {
    constructor(err, msg) {
        if (RetryError.promotable(err)) {
            return new RetryError(err.message, err.msg);
        }
        const cause = err instanceof Error ?
            err : new Error(err.toString());
        super(cause.message, msg);
        this.cause = cause;
    }
    static is(msg) {
        return msg.properties.headers?.['x-retry-error'] === true;
    }
    static promotable(err) {
        return err instanceof MessageError && RetryError.is(err.msg);
    }
    toHeaders() {
        return {
            ...super.toHeaders(),
            'x-retry-error': true
        };
    }
}

function isRetryable(err) {
    if (err instanceof TypeError ||
        err instanceof ReferenceError ||
        err instanceof SyntaxError ||
        err instanceof RangeError ||
        err instanceof RetryError ||
        RetryError.promotable(err) ||
        err.cause && err.cause.message.startsWith('Channel ended')) return false;
    else if (err instanceof MessageError) {
        const { properties: { headers = {} } } = err.msg;
        return headers['x-retry-error'] !== true;
    }
    // TODO(naggingant) more checks
    return true;
}

module.exports = {
    symbolRetried: Symbol.for('hato.retry.retried'),
    isRetryable,
    RetryError
};
