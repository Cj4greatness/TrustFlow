import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { buildCorsOptions } from '../../src/common/cors/cors.config';
import { RedisService } from '../../src/redis/redis.service';

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

  const clearThrottleKeys = async () => {
    const client = app.get(RedisService).getClient();
    const keys = await client.keys('throttle:*');
    if (keys.length > 0) await client.del(...keys);
  };

  afterAll(async () => {
    // The 429 test below fills this machine's login throttle bucket; leave
    // no state behind for other suites.
    await clearThrottleKeys();
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

  describe('error responses and throttling', () => {
    beforeEach(clearThrottleKeys);

    it('carries CORS headers on a 401 so the browser can read the error', async () => {
      const res = await request(app.getHttpServer())
        .get('/organizations/me')
        .set('Origin', ALLOWED);

      expect(res.status).toBe(401);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    });

    it('carries CORS headers on a 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/no-such-route')
        .set('Origin', ALLOWED);

      expect(res.status).toBe(404);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    });

    it('carries CORS headers, and exposes Retry-After, on a 429', async () => {
      const email = `cors-429-${Date.now()}@example.com`;
      let last = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', ALLOWED)
        .send({ email, password: 'wrong-password-1' });

      for (let i = 0; i < 5 && last.status !== 429; i++) {
        last = await request(app.getHttpServer())
          .post('/auth/login')
          .set('Origin', ALLOWED)
          .send({ email, password: 'wrong-password-1' });
      }

      expect(last.status).toBe(429);
      expect(last.headers['access-control-allow-origin']).toBe(ALLOWED);
      expect(last.headers['retry-after']).toBeDefined();
      expect(last.headers['access-control-expose-headers']).toContain(
        'Retry-After',
      );
    });

    it('does not count preflight (OPTIONS) requests against the login throttle', async () => {
      // Far more preflights than the 5-per-window login limit.
      for (let i = 0; i < 12; i++) {
        const pre = await request(app.getHttpServer())
          .options('/auth/login')
          .set('Origin', ALLOWED)
          .set('Access-Control-Request-Method', 'POST')
          .set('Access-Control-Request-Headers', 'content-type');
        expect(pre.status).toBe(204);
      }

      // The real login must still be answered by the handler (401 for bad
      // credentials), not blocked by the throttler (429).
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', ALLOWED)
        .send({
          email: `cors-preflight-${Date.now()}@example.com`,
          password: 'wrong-password-1',
        });

      expect(res.status).toBe(401);
    });
  });
});
