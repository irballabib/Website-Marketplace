import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as pino from 'pino';

import { AppModule } from './app.module';

async function bootstrap() {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);

  // Global prefix
  app.setGlobalPrefix('api/v1');

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

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    })
  );

  // Swagger/OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Cutbray Marketplace API')
    .setDescription('Omnichannel platform for Cutbray pants brand')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('health', 'Health checks')
    .addTag('auth', 'Authentication')
    .addTag('catalog', 'Product catalog')
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

bootstrap();