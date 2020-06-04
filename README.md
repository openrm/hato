# hato

[![CircleCI](https://img.shields.io/circleci/build/github/openrm/hato)](https://app.circleci.com/pipelines/github/openrm/hato?branch=master)
[![Code Climate maintainability](https://img.shields.io/codeclimate/maintainability/openrm/hato)](https://codeclimate.com/repos/5eb8c1314deafc018c000c2a/maintainability)
[![Code Climate coverage](https://img.shields.io/codeclimate/coverage/openrm/hato)](https://codeclimate.com/repos/5eb8c1314deafc018c000c2a/test_coverage)
[![GitHub](https://img.shields.io/github/license/openrm/hato)](https://github.com/openrm/hato/blob/master/LICENSE)

A minamalist, customizeable AMQP framework

## Installation
```sh
$ git clone https://github.com/openrm/hato.git
```

## About
hato aims to simplify messaging without diminishing the flexibility and power in doing so.

This library is highly customizeable. Plugins allow for a configuration that fits your project and for extension of the library to meet unique requirements.

The library is built upon [amqplib](https://www.npmjs.com/package/amqplib) and is compatible with AMQP 0-9-1 and is promise based (the implementation of which can be overriden).

## Getting Started

Include the library and plugins

```js
const { Client, plugins } = require('hato');
```


Construct a new client
```js
const client = new Client(BROKER_URL, {
    plugins: [
        'gracefulShutdown', // register plugin with default options
        'connectionRetry',
        'duplex',
        new plugins.Encoding('json') // instantiate for a detailed configuration
    ],

    /**
     * Optionally specify a module for logging
     */
    logger: myLogger,
});
```

Create a queue and subscribe to an event
```js
client
    .type('topic')
    .queue('my.queue', { exclusive: true })
    .subscribe('an.event', async (msg) => {
        console.log(msg);

        // Acknowladge the message
        msg.ack();
    });
```

Start the client
```js
client
    .start()
    .catch(console.error);
````

After the client is started, you can publish a message to the queue
```js
client
    .type('topic')
    .publish('an.event', Buffer.from('An event'))
    .catch(console.error);
```

## Running Tests

Make sure you have a message broker running. The tests expect [RabbitMQ](https://www.rabbitmq.com/).

```sh
$ docker run -it --name rabbitmq -p 5672:5672 rabbitmq:3.6-alpine
```
Then run
```sh
$ make test
$ make lint
```

## License
[MIT](https://github.com/openrm/hato/blob/master/LICENSE)
