import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  // API documentation, auto-generated from controllers/DTOs as they're
  // built in future sprints. Currently only reflects the Health
  // endpoint since that's all that exists.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('TrustFlow API')
    .setDescription('AI-powered Business Operating System for SMBs')
    .setVersion('0.1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`TrustFlow API running on http://localhost:${port}`);
  console.log(`API docs available at http://localhost:${port}/api/docs`);
}

void bootstrap();
