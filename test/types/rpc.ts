import amqplib from 'amqplib';
import hato from '../..';

interface RPCOptions extends amqplib.Options.Publish {
    uid?: () => string
    timeout?: number
}

interface RPCClient extends hato.IClient {
    rpc(routingKey: string, content: Buffer, options?: RPCOptions): Promise<amqplib.ConsumeMessage>;
}

const client = new hato.Client('amqp://localhost:5672') as RPCClient;

client
    .type('direct')
    .rpc('test', Buffer.from('hello'), { timeout: 1_000 })
    .then(msg => console.log(msg.content));
