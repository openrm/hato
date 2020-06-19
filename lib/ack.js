const key = Symbol.for('hato.ack.state');

/**
 * @param {import('./api').Channel} ch
 * @param {import('./api').Message} msg
 */
module.exports.createState = (ch, msg) => {
    let acked = false;
    /** @type {boolean[]} */
    const state = [];
    /**
     * @param {(...args: boolean[]) => void} fn
     * @param {boolean} negative
     */
    const once = (fn, negative) => ({
        writable: true,
        /**
         * @type {(...args: boolean[]) => void}
         */
        value: (...args) => {
            if (acked) return;
            acked = true;
            fn(...args);
            state.push(negative, ...args);
        }
    });
    return {
        ack: once(ch.ack.bind(ch, msg), false),
        nack: once(ch.nack.bind(ch, msg), true),
        // nack() does not work on RabbitMQ < v2.3.0,
        // use reject() instead
        reject: once(ch.reject.bind(ch, msg), true),
        [key]: { get: () => state }
    };
};
