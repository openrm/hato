import hato from '../..';

const client = new hato.Client('amqp://localhost:5672');

client
    .exchange('search.internal', 'direct', { durable: true, autoDelete: true })
    .prefetch(1)
    .consume('test', msg => msg.nack(false, false))
    .then(({ consumerTag }) => client.cancel(consumerTag));

client
    .type('direct')
    .queue('test', { durable: true })
    .subscribe('test', msg => msg.ack())
    .on('error', console.error)
    .then(({ consumerTag }) => console.log('tag', consumerTag));

client
    .type('direct')
    .publish('test', Buffer.from('hello'))
    .then(() => console.log('published'));

client.start().then(client => client.close());
