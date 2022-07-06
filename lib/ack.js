const key = Symbol.for('hato.ack.state');

module.exports.createState = (ch, msg) => {
    let acked = false;
    const state = [];
    const once = (fn, negative) => ({
        writable: true,
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
