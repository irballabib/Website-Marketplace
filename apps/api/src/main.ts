import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'node:path';
import pino from 'pino';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);

  app.enableShutdownHooks();

  // Global prefix: combined with URI versioning this yields /api/v1/...
  app.setGlobalPrefix('api');

  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // CORS
  app.enableCors({
    origin: configService.get<string[]>('CORS_ORIGINS') ?? ['http://localhost:3000', 'http://localhost:3002'],
    credentials: true,
  });

  // Product media served by the local (mock) storage adapter.
  const storagePath = configService.get<string>('STORAGE_LOCAL_PATH')?.trim() || './storage';
  app.useStaticAssets(resolve(process.cwd(), storagePath, 'catalog'), {
    prefix: '/uploads/catalog/',
    index: false,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    })
  );

  // Uniform error envelope: { code, message, details? }
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger/OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Bale Store API')
    .setDescription('Marketplace and omnichannel API for Bale Store')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('health', 'Health checks')
    .addTag('auth', 'Authentication')
    .addTag('catalog', 'Product catalog')
    .addTag('catalog-admin', 'Catalog administration')
    .addTag('orders', 'Orders & checkout')
    .addTag('pos', 'Point of Sale')
    .addTag('bookings', 'Bookings & DP')
    .addTag('inventory', 'Inventory management')
    .addTag('production', 'Production & BOM')
    .addTag('accounting', 'Accounting & journals')
    .addTag('payments', 'Payments & webhooks')
    .addTag('reports', 'Financial reports')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = configService.get<number>('API_PORT') ?? 3001;
  await app.listen(port);

  logger.info(`🚀 API running on http://localhost:${port}/api/v1`);
  logger.info(`📚 Swagger docs: http://localhost:${port}/docs`);
}

void bootstrap();