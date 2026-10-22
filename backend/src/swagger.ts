import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/**
 * Single source for the OpenAPI document, shared by the running
 * server (served at /api/docs and /api/docs-json) and the offline
 * export script (src/openapi-export.ts), so the file the frontend
 * generates its client from can never drift from what the server
 * serves.
 *
 * Bearer auth: every protected controller already carries
 * @ApiBearerAuth(), but without addBearerAuth() here the security
 * scheme was never DEFINED in the document — so the decorators
 * pointed at nothing and Swagger UI had no "Authorize" button.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('TrustFlow API')
    .setDescription(
      [
        'AI-powered Business Operating System for SMBs.',
        '',
        'Authentication: obtain an access token from POST /auth/login (or /auth/register) and send it as `Authorization: Bearer <token>`.',
        '',
        'Money: invoices, payments and receipts use integer kobo (JSON numbers). Orders, order items and products use decimal naira strings (e.g. "1000.00"). See the frontend integration notes.',
      ].join('\n'),
    )
    .setVersion('0.1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Access token from POST /auth/login or /auth/register',
    })
    .build();
  return SwaggerModule.createDocument(app, config);
}
