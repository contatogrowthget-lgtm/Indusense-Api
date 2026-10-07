import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // O Flutter usa baseUrl .../v1, então todas as rotas ficam sob /v1.
  const prefix = config.get<string>('API_PREFIX', 'v1');
  app.setGlobalPrefix(prefix);

  const origens = config.get<string>('CORS_ORIGINS', 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || origens.includes('*') || origens.includes(origin)),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    maxAge: 86400,
  });

  // fotos das ocorrências de EPI chegam em base64 no JSON
  app.useBodyParser('json', { limit: config.get<string>('BODY_LIMIT', '8mb') });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const doc = new DocumentBuilder()
    .setTitle('InduSense API')
    .setDescription('API central do InduSense — usada pelo app Flutter e pelo painel Next.js.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc), {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = Number(config.get('PORT', 3333));
  await app.listen(port);
  Logger.log(`API:     http://localhost:${port}/${prefix}`, 'Bootstrap');
  Logger.log(`Swagger: http://localhost:${port}/docs`, 'Bootstrap');
}
bootstrap();
