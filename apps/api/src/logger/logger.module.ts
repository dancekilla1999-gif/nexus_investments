import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppConfigModule } from '../config/app-config.module';
import { AppConfigService } from '../config/app-config.service';

/**
 * Structured JSON logging via pino, with a correlation id on every request that also ends up
 * in error responses (see AllExceptionsFilter) — grep one id, see the whole request across
 * access log, app logs, and the client-facing error body. Pretty-printed in development only;
 * production emits raw JSON for the log aggregator (docs/02-system-architecture.md §5).
 */
@Module({
  imports: [
    AppConfigModule,
    PinoLoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.logLevel,
          genReqId: (req: { headers: Record<string, unknown> }) =>
            (req.headers['x-request-id'] as string) ?? randomUUID(),
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.refreshToken',
              'req.body.code',
            ],
            censor: '[redacted]',
          },
          transport:
            config.nodeEnv === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
              : undefined,
          customSuccessMessage: (req, res) => `${req.method} ${req.url} -> ${res.statusCode}`,
          customErrorMessage: (req, res, err) =>
            `${req.method} ${req.url} -> ${res.statusCode}: ${err.message}`,
        },
      }),
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
