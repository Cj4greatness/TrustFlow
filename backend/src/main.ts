import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { buildCorsOptions } from './common/cors/cors.config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // DEPLOYMENT NOTE (Backend Readiness & Freeze Audit, Authentication
  // pass): Express's `trust proxy` is intentionally left at its
  // default (false) here, matching the app's current direct-exposure
  // Docker Compose setup with no reverse proxy in front of it. This
  // is the SAFE default — req.ip reflects the actual TCP connection
  // and cannot be spoofed via X-Forwarded-For.
  //
  // This MUST be revisited before deploying behind any reverse proxy
  // or load balancer (e.g. GCP Cloud Run/GKE Ingress, an AWS ALB,
  // Nginx) — behind such a proxy, every request will otherwise
  // appear to originate from the proxy's single IP, collapsing the
  // auth rate limiter's per-IP buckets (see AuthModule) into one
  // shared limit for every real client. When that deployment target
  // is chosen, set the exact trusted-hop count for that topology,
  // e.g.: app.set('trust proxy', 1);
  // Do not set this to `true` (trusts every hop unconditionally) —
  // that would let a client forge their own X-Forwarded-For value
  // and bypass IP-based rate limiting entirely.

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  // CORS: explicit origin allowlist from CORS_ALLOWED_ORIGINS (validated at
  // config load; a wildcard or malformed value stops startup). Bearer tokens
  // only, so credentials stay off. Unset/empty = CORS not enabled. See
  // common/cors/cors.config.ts for the full policy and rationale.
  const corsAllowedOrigins = app
    .get(ConfigService)
    .get<string[]>('cors.allowedOrigins', []);
  if (corsAllowedOrigins.length > 0) {
    app.enableCors(buildCorsOptions(corsAllowedOrigins));
    console.log(`CORS enabled for: ${corsAllowedOrigins.join(', ')}`);
  } else {
    console.log('CORS disabled (CORS_ALLOWED_ORIGINS is not set)');
  }

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
