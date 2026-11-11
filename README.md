# hato

[![CircleCI](https://img.shields.io/circleci/build/github/openrm/hato)](https://app.circleci.com/pipelines/github/openrm/hato?branch=master)
[![npm](https://img.shields.io/npm/v/hato)](https://www.npmjs.com/package/hato)
![node-lts](https://img.shields.io/node/v-lts/hato)
![npm peer dependency version](https://img.shields.io/npm/dependency-version/hato/peer/amqplib)
[![Code Climate maintainability](https://img.shields.io/codeclimate/maintainability/openrm/hato)](https://codeclimate.com/github/openrm/hato/maintainability)
[![Code Climate coverage](https://img.shields.io/codeclimate/coverage/openrm/hato)](https://codeclimate.com/github/openrm/hato/test_coverage)
[![GitHub](https://img.shields.io/github/license/openrm/hato)](https://github.com/openrm/hato/blob/master/LICENSE)

A minimalist, customizeable AMQP framework

## Installation
```sh
$ npm install hato amqplib
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
    logger: myLogger
});
```

Create a queue and subscribe to an event
```js
client
    .type('topic')
    .queue('my.queue', { exclusive: true })
    .subscribe('an.event', (msg) => {
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

After the client started, you can publish a message to the queue
```js
client
    .type('topic')
    .publish('an.event', Buffer.from('An event'))
    .catch(console.error);
```

## Shutting down

`GracefulShutdown` closes the connection on `SIGINT` and `SIGTERM`. By default it does so at once, and a message that is being processed loses its channel: whatever its handler still does (acknowledge, publish, call another service) fails.

With `drain`, the subscriptions are cancelled first so that no new message is taken, the messages being processed are waited for, and only then is the connection closed:

```js
const { Client, plugins } = require('hato');

const client = new Client(BROKER_URL, {
    plugins: [
        new plugins.GracefulShutdown({ drain: { timeout: 25000 } }), // `drain: true` waits up to 30000 ms
        // ...
    ]
});
```

A whole handler is waited for, whichever plugins surround it: a retry being scheduled by `Retry` and a reply being sent by `RPC` count as part of it. A message still in progress at the timeout is not acknowledged, so the broker redelivers it. The plugin position in the list does not matter.

The process has to be given the time: with Kubernetes, `terminationGracePeriodSeconds` has to exceed the timeout.

An application that handles the signals itself can use the instance instead:

```js
const graceful = new plugins.GracefulShutdown();

process.on('SIGTERM', async() => {
    await graceful.stopConsuming();       // the RPC reply queue is left alone: the messages in progress may wait for it
    const drained = await graceful.drain(25000); // false if the messages are still in progress at the timeout
    await client.close();
});
```

## Running Tests

Make sure you have a message broker running. The tests expect [RabbitMQ](https://www.rabbitmq.com/).

```sh
$ docker run -it --name rabbitmq -p 5672:5672 rabbitmq:4-alpine
```
Then run
```sh
$ make test
$ make tdd
$ make lint
```

## License
[MIT](https://github.com/openrm/hato/blob/master/LICENSE)
