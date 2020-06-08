const state = new WeakMap();

function forwardEvents(src, dst, ...events) {
    events.forEach((name) => src.on(name, (...args) => {
        if (state.has(dst) && state.get(dst).includes(name)) return;
        state.set(src, (state.get(src) || []).concat(name));
        dst.emit(name, ...args);
        state.set(src, state.get(src).filter(_name => _name !== name));
    }));
    return dst;
}

function forwardAllEvents(src, dst, bidirectional = false, but = []) {
    if (bidirectional) forwardAllEvents(dst, src, false, but);
    but = but.concat('newListener', 'removeListener');
    const events = dst.eventNames().filter((name) => !but.includes(name));
    return forwardEvents(src, dst, ...events)
        .on('newListener', (eventName) => {
            if (!events.concat(but).includes(eventName)) {
                forwardEvents(src, dst, eventName);
            }
        });
}

module.exports = {
    events: {
        forward: forwardEvents,
        forwardAll: forwardAllEvents
    },
    promise: {
        /**
         * @template T
         * @param {(msg: any) => Promise<T>} fn
         * @return {Promise<T>}
         * */
        wrap: (fn) => Promise.resolve().then(fn)
    },
    expose: (src, dst, ...members) => {
        members.forEach((member) => {
            if (src[member] === undefined) return;
            if (typeof src[member] === 'function') {
                dst[member] = src[member].bind(src);
            }
            else dst[member] = src[member];
        });
        return dst;
    }
};
