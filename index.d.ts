import events from 'events'
import amqplib from 'amqplib'

export as namespace hato;

/**
 * Types
 */
export type ExchangeType = 'fanout' | 'direct' | 'topic' | 'headers';

export interface Consumer extends Promise<amqplib.Replies.Consume>, events.EventEmitter {}

export interface ConsumeMessage extends amqplib.ConsumeMessage {
    ack(allUpTo?: boolean): void
    nack(allUpTo?: boolean, requeue?: boolean): void
    cancel(): void
}

/**
 * Plugins
 */
export namespace Plugins {
    abstract class Base {
        constructor(name: string)
        abstract init(): void;
        abstract destroy(): void;
    }
    interface Plugin<T> extends Plugins.Base {
        new(options?: T): Plugin<T>
    }
    interface Defaults {
        Base: Base
        GracefulShutdown: Plugin<Options.GracefulShutdown>
        ConnectionRetry: Plugin<Options.ConnectionRetry>
        Duplex: Plugin<Options.Duplex>
        DLX: Plugin<Options.DLX>
        Encoding: Plugin<Options.Encoding>
        RPC: Plugin<Options.RPC>
        Confirm: Plugin<Options.Confirm>
        Retry: Plugin<Options.Retry>
        ServiceContext: Plugin<Options.ServiceContext>
        DefaultOptions: Plugin<Options.DefaultOptions>
    }
    namespace Options {
        type GracefulShutdown = null;
        interface ConnectionRetry {
            retries?: number
            min?: number
            max?: number
            base?: number
        }
        type Duplex = null;
        interface DLX {
            name?: string,
                type?: ExchangeType,
                options?: amqplib.Options.AssertExchange
        }
        type Encoding = 'json';
        interface RPC {
            uid?: () => string
            timeout?: number
        }
        interface Confirm {
            uid?: () => string
        }
        interface Retry {
            retries?: number
            strategy?: 'constant' | 'linear' | 'exponential'
            min?: number
            max?: number
            base?: number
        }
        interface ServiceContext {
            name?: string,
            version?: string
            instanceId?: string
            namespace?: string
            queue?: { options?: amqplib.Options.AssertQueue }
        }
        interface DefaultOptions {
            prefetch?: number
            queue?: amqplib.Options.AssertQueue
            exchange?: amqplib.Options.AssertExchange
            consume?: amqplib.Options.Consume
            publish?: amqplib.Options.Publish
        }
    }
}

export const plugins: Plugins.Defaults

/**
 * Client
 */

interface Logger {
    debug(message: string): void
    info(message: string): void
    warn(message: string): void
    error(message: string): void
}

interface API {
    assert(enable: boolean): this
    prefetch(count: number): this
    type(type: ExchangeType): this
    exchange(exchange: string, type?: ExchangeType, options?: amqplib.Options.AssertExchange): this
    queue(name: string, options?: amqplib.Options.AssertQueue): this
    subscribe(pattern: string, fn: (msg: ConsumeMessage) => void): Consumer
    consume(pattern: string, fn: (msg: ConsumeMessage) => void): Consumer
    cancel(consumerTag: string): Promise<amqplib.Replies.Empty>
    publish(routingKey: string, content: Buffer, options?: amqplib.Options.Publish): Promise<void>;
}

interface Options {
    logger?: Logger
    plugins?: (Plugins.Plugin<any> | string)[]
}

export interface IClient extends events.EventEmitter, API {
    new(url: Parameters<typeof amqplib.connect>[0], options?: Options): this
    start(url: Parameters<typeof amqplib.connect>[0], options?: Options): Promise<this>

    start(): Promise<this>
    close(): Promise<void>
}

export const Client: IClient;
export function connect(url: Parameters<typeof amqplib.connect>[0], options?: Options): Promise<IClient>
