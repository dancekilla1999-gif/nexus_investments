import { ClassSerializerInterceptor, INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import compression from 'compression';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { validationExceptionFactory } from './common/validation-exception.factory';
import { AppConfigService } from './config/app-config.service';

/**
 * The single source of truth for how a Nest application instance is wired — middleware,
 * pipes, filters, interceptors, versioning. `main.ts` and the e2e test bootstrap
 * (test/utils/test-app.ts) both call this so tests exercise the exact same request pipeline
 * production traffic does, not a hand-approximated subset of it.
 */
export function configureApp(app: INestApplication): AppConfigService {
  const config = app.get(AppConfigService);

  // Swagger UI (non-production only) needs inline scripts/styles; a real CSP only makes sense
  // once there's no HTML surface to protect against injection into, which for a JSON API is
  // effectively "always" outside the doc explorer — so we scope the tighter policy to prod.
  app.use(
    helmet({
      contentSecurityPolicy: config.nodeEnv === 'production' ? { useDefaults: true } : false,
    }),
  );
  app.use(compression());
  app.enableCors({ origin: config.corsAllowedOrigins, credentials: true });
  app.enableShutdownHooks();

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  return config;
}
