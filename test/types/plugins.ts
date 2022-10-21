import hato, { plugins } from '../..';

new hato.Client('amqp://localhost:5672', {
    plugins: [
        new plugins.ConnectionRetry(),
        new plugins.Duplex(),
        new plugins.Encoding('json'),
        new plugins.RPC({ timeout: 30_000 }),
        new plugins.Confirm(),
        new plugins.Retry({ base: 1.5 }),
        new plugins.ServiceContext({
            name: 'test',
            version: '0.0.0'
        }),
        new plugins.DefaultOptions({
            prefetch: 20,
            queue: {
                durable: true
            },
            exchange: {
                durable: true
            },
            publish: {
                persistent: true,
                mandatory: true
            }
        })
    ]
});
