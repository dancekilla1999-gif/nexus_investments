import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  // bufferLogs holds Nest's bootstrap logs until the pino logger (attached below) takes over,
  // so nothing is lost or double-formatted during startup.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.flushLogs();

  const config = configureApp(app);

  if (config.nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Nexus Investments API')
      .setDescription(
        'REST API for the Nexus Investments platform. See /docs in the repository root for ' +
          'full architecture documentation. This spec covers MVP1 (Auth + User); further ' +
          'modules are documented in docs/04-api-architecture.md as they ship.',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.port ?? 4000;
  await app.listen(port);
  app.get(Logger).log(`listening on :${port} (mode=${config.platformMode}, env=${config.nodeEnv})`);
}

bootstrap();
