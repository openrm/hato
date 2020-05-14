const { Client } = require('..');
const DeadLetter = require('./dlx');

describe('dlx plugin', () => {
    let client;

    const options = {
        exchange: {
            name: 'dlx',
            topic: '#',
            options: {
                autoDelete: true
            }
        }
    };

    beforeEach(() => {
        return new Client('amqp://guest:guest@127.0.0.1:5672', {
            plugins: [new DeadLetter(options)]
        })
            .start()
            .then((cli) => client = cli);
    });

    afterEach(() => client && client.close());

    it('should dead-letter nack\'d messages', (done) => {
        client
            .exchange('dlx')
            .queue('deadLetters', { exclusive: true, noAck: true, deadLetterExchange: null })
            .subscribe('#', (msg) => {
                if (msg.fields.routingKey === 'key'
                    && msg.properties.headers['x-first-death-exchange'] === '') {
                    done();
                } else {
                    done(new Error('Message routed differently'));
                }
            })
            .then(() => client
                .subscribe('key', (msg) => {
                    msg.nack(false, false);
                }))
            .then(() => client.publish('key', Buffer.from('hello')))
            .catch(done);
    });
});
