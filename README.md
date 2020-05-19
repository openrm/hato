# amqp-node

![CircleCI](https://img.shields.io/circleci/build/github/openrm/amqp-node)
![Code Climate maintainability](https://img.shields.io/codeclimate/maintainability/openrm/amqp-node)
![Code Climate coverage](https://img.shields.io/codeclimate/coverage/openrm/amqp-node)

A minamalist, customizeable AMQP framework

## Installation
```sh
$ git clone https://github.com/openrm/amqp-node.git
```

## About
amqp-node aims to simplify messaging without diminishing the flexibility and power in doing so.

This library is highly customizeable. Plugins allow for a configuration that fits your project and for extension of the library to meet unique requirements.

## Getting Started

Make sure you have a message broker running. The following example uses [Rabbit MQ](https://www.rabbitmq.com/).

```sh
$ docker run -it --name rabbitmq -p 5672:5672 rabbitmq:3.6-alpine
```

Include the library and plugins

```js
const { Client, plugins } = require('../amqp-node');
```


Construct a new client with the plugins of your choosing
```js
const client = new Client(RABBITMQ_URL, {
    plugins: [
        new plugins.GracefulShutdown(),
        new plugins.ConnectionRetry(),
        new plugins.Duplex(),
        new plugins.Encoding('json'),
        new plugins.RPC(),
        new plugins.Confirm(),
        new plugins.Retry()
    ]
});
```

Initialize the client
```js
client
    .init()
    .catch(e => console.error(e));
```

Create a queue and subscribe to an event
```js
client
    .queue('ex:my.queue', { exclusive: true })
    .type('topic')
    .subscribe('an.event', async (msg) => {
        console.log(msg);

        // Acknowladge the message
        msg.ack();
    });
```

Send a message to the queue
```js
client.type('topic')
    .publish('an.event', { content: 'An event' })
    .catch(e => console.error(e));
```


## License
[MIT](https://github.com/openrm/amqp-node/blob/master/LICENSE)