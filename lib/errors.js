/**
 * @typedef {import('amqplib').Message} Message
 * @typedef {import('amqplib').MessageFields} MessageFields
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
    constructor(timeout, message) {
        super(`Operation timed out after ${timeout}ms` + (message ? ` - ${message}` : ''));
        this.name = 'TimeoutError';
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
            fields = {},
            properties: {
                headers: {
                    [MessageError.keys.trace]: trace = [],
                    ...headers
                }
            }
        } = msg;

        this.msg = msg;
        this.trace = trace.concat(fields);
        this.originalHeaders = headers;
        this.name = 'MessageError';
    }
    /**
     * @param {Message} msg
     */
    static is(msg) {
        return msg.properties.headers[MessageError.keys.error] === true;
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
        /**
         * @constructor
         * @param {string} detail
         * @param {BouncedMessage} msg
         */
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
    /**
     * @constructor
     * @param {BouncedMessage} msg
     */
    constructor(msg) {
        super('Message undeliverable immediately.', msg);
        this.name = 'UndeliverableMessageError';
    }
};

module.exports.UnroutableMessageError = class UnroutableMessageError extends BounceError {
    /**
     * @constructor
     * @param {BouncedMessage} msg
     */
    constructor(msg) {
        super('Message unroutable.', msg);
        this.name = 'UnroutableMessageError';
    }
};
