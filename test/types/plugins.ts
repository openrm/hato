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

const graceful = new plugins.GracefulShutdown({ drain: { timeout: 20_000 } });
new plugins.GracefulShutdown();
new plugins.GracefulShutdown({ drain: true });
new plugins.GracefulShutdown({ drain: false, signals: false });
new plugins.GracefulShutdown({ signals: ['SIGTERM', 'SIGHUP'] });
new hato.Client('amqp://localhost:5672', { plugins: [graceful] });

graceful.stopConsuming()
    .then(() => graceful.drain(5000))
    .then((drained: boolean) => console.log(drained, graceful.inflight));
