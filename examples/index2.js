const { Client } = require('../..');

// initialize a client.
const options = {
    logger: console
};
const client = new Client('amqp://guest:guest@127.0.0.1:5672', options);

// assert some exchanges.
client
    .exchange('exchange0', 'topic', { durable: true })
    .exchange('exchange1', 'headers');


//
// subscriptions
//

client
    .subscribe((msg) => {
        // subscription without parameters results in
        // listening to `amq.fanout`
        msg.ack();
        // call this method to acknowledge.
    });

client
    .subscribe('a.routing.key', (msg) => {
        // queue with auto-generated name.
        // listens to the default direct exchange ''
        msg.nack();
        // call this method to negatively acknowledge.
    });

client
    .exchange(null, 'topic')
    .subscribe('a.topic#', (msg) => {
        // queue with auto-generated name.
        // listens to `amq.topic`
    });

client
    .exchange(null, 'headers')
    .subscribe({ 'x-match': 'any', 'foo': 'bar', 'a': 'b' }, (msg) => {
        // you can pass an object as binding key
        // for headers exchanges
    });

client
    .queue('doSomething') // triggers assertQueue(),
    .exchange('exchange0')
    .subscribe('a.routing.key', (msg) => {
        // one can specify the queue name
        // and bind to a specific exchange as well.
    });


//
// publications
//

// somewhere inside callback functions
async (msg) => {
    try {
        // publish to the default unnamed exchange (direct.)
        await client
            .publish('a.routing.key', 'message');

        // the routing key will be ignored.
        await client
            .exchange(null, 'fanout')
            .publish('a.routing.key', 'message');

        // specify the default topic exchange.
        await client
            .exchange(null, 'topic')
            .publish('another.routing.key', { data: 'hello' });

        // assert a custom exchange.
        await client
            .exchange('direct', 'my-exchange')
            .publish('another.routing.key', { data: 'yes' }, { persistent: true });

        // make a rpc.
        const res = await client
            .exchange('direct')
            .rpc('process.file', { file });
    } catch (err) {
        // one should catch any exception for retries, fallbacks, etc.
    }
}


// start serving
client.start();
