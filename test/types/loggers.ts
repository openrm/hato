import hato from '../..';
import pino from 'pino';
import bunyan from 'bunyan';
import winston from 'winston';

new hato.Client('amqp://localhost:5672', { logger: pino() });
new hato.Client('amqp://localhost:5672', { logger: bunyan.createLogger({ name: 'test' }) });
new hato.Client('amqp://localhost:5672', { logger: winston.createLogger() });
