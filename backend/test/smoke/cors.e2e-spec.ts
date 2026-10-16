import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { buildCorsOptions } from '../../src/common/cors/cors.config';

/**
 * CORS allowlist (e2e)
 *
 * Boots the real AppModule, applies the SAME options builder main.ts uses,
 * and checks the headers a browser would act on, through real HTTP
 * (preflight and simple requests). main.ts itself is not run here (like
 * every other e2e spec, tests build the app from AppModule); the options
 * and the wiring decision live in common/cors/cors.config.ts and are
 * unit-tested in cors.config.spec.ts.
 */
describe('CORS allowlist (e2e)', () => {
  let app: INestApplication<App>;

  const ALLOWED = 'http://localhost:3000';
  const OTHER_ALLOWED = 'https://app.trustflow.example';
  const DISALLOWED = 'https://evil.example';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<INestApplication<App>>();
    app.enableCors(buildCorsOptions([ALLOWED, OTHER_ALLOWED]));
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('preflight (OPTIONS)', () => {
    it('allows a listed origin, method and headers, with no credentials', async () => {
      const res = await request(app.getHttpServer())
        .options('/organizations/me')
        .set('Origin', ALLOWED)
        .set('Access-Control-Request-Method', 'PATCH')
        .set('Access-Control-Request-Headers', 'authorization,content-type');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
      expect(res.headers['access-control-allow-methods']).toBe(
        'GET,POST,PATCH,DELETE,OPTIONS',
      );
      expect(res.headers['access-control-allow-headers']).toBe(
        'Authorization,Content-Type',
      );
      expect(res.headers['access-control-max-age']).toBe('600');
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
      expect(res.headers['vary']).toMatch(/Origin/i);
    });

    it('echoes only the matching origin when several are allowed', async () => {
      const res = await request(app.getHttpServer())
        .options('/organizations/me')
        .set('Origin', OTHER_ALLOWED)
        .set('Access-Control-Request-Method', 'GET');

      expect(res.headers['access-control-allow-origin']).toBe(OTHER_ALLOWED);
    });

    it('gives an unlisted origin no allow-origin header', async () => {
      const res = await request(app.getHttpServer())
        .options('/organizations/me')
        .set('Origin', DISALLOWED)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'authorization');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('never answers with a wildcard origin', async () => {
      for (const origin of [ALLOWED, OTHER_ALLOWED, DISALLOWED, 'null']) {
        const res = await request(app.getHttpServer())
          .options('/organizations/me')
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'GET');
        expect(res.headers['access-control-allow-origin']).not.toBe('*');
      }
    });

    it('does not allow the literal "null" origin', async () => {
      const res = await request(app.getHttpServer())
        .options('/organizations/me')
        .set('Origin', 'null')
        .set('Access-Control-Request-Method', 'GET');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('actual requests', () => {
    it('adds allow-origin and exposed headers for a listed origin', async () => {
      const res = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', ALLOWED);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
      expect(res.headers['access-control-expose-headers']).toContain(
        'Retry-After',
      );
      expect(res.headers['access-control-expose-headers']).not.toContain('*');
      expect(res.headers['vary']).toMatch(/Origin/i);
    });

    it('does not grant an unlisted origin access', async () => {
      const res = await request(app.getHttpServer())
        .get('/health')
        .set('Origin', DISALLOWED);

      // Without Access-Control-Allow-Origin the browser refuses to expose
      // the response to the page. (The cors library still lists
      // Access-Control-Expose-Headers here; that is only header NAMES and
      // has no effect without the allow-origin header.)
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('adds no CORS headers when there is no Origin (server-to-server)', async () => {
      const res = await request(app.getHttpServer()).get('/health');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
