/**
 * @typedef { import("amqplib").Message } Message
 * @typedef { import("amqplib").MessageFields } MessageFields
 * @typedef {Message & {
 *   fields: MessageFields & {
 *     replyText: string
 *   }
 * }} BouncedMessage
 */

// a semantic error for when an operation is timed out
module.exports.TimeoutError = class TimeoutError extends Error {
    /**
     * @constructor
     * @param {number} timeout
     */
    constructor(timeout) {
        super(`Operation timed out after ${timeout}ms`);
    }
};

module.exports.MessageError = class MessageError extends Error {
    /**
     * @constructor
     * @param {string} text
     * @param {Message} msg
     */
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
    /**
     * @param {Message} msg
     */
    static is(msg) {
        return msg.properties.headers[MessageError.keys.error] === true;
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
        /**
         * @constructor
         * @param {string} detail
         * @param {BouncedMessage} msg
         */
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
    };

module.exports.UndeliverableMessageError = class UndeliverableMessageError extends BounceError {
    /**
     * @constructor
     * @param {BouncedMessage} msg
     */
    constructor(msg) {
        super('Message undeliverable immediately:', msg);
    }
};

module.exports.UnroutableMessageError = class UnroutableMessageError extends BounceError {
    /**
     * @constructor
     * @param {BouncedMessage} msg
     */
    constructor(msg) {
        super('Message unroutable:', msg);
    }
};
