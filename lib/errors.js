// a semantic error for when an operation is timed out
class TimeoutError extends Error {
    constructor(timeout) {
        super(`Operation timed out after ${timeout}ms`);
    }
}

module.exports = {
    TimeoutError,
    isFatal: require('./client').isFatalError
};
