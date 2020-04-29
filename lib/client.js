const amqp = require('amqplib');
const { isFatalError } = require('amqplib/lib/connection');

module.exports = {
    connect,
    isFatalError
};

function connect(url, socketOptions) {
    const connecting = amqp.connect(url, socketOptions);
    return Promise.resolve(connecting);
}
