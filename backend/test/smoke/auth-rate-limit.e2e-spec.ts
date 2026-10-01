import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

interface ErrorResponseBody {
  message: string | string[];
  statusCode: number;
  details?: {
    retryAfterSeconds?: number;
  };
}

interface RegisterResponseBody {
  refreshToken: string;
}

interface RefreshResponseBody {
  refreshToken: string;
}

describe('Auth Rate Limiting (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const PASSWORD = 'SecurePass123';

  let ipCounter = 0;
  const uniqueIp = (): string => {
    ipCounter += 1;
    return `10.99.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
  };
  const uniqueEmail = (label: string): string =>
    `${label}-${randomUUID()}@example.com`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    server = app.getHttpServer();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('login — IP bucket', () => {
    it('allows 5 attempts from the same IP (each with a fresh email, isolating the IP dimension)', async () => {
      const ip = uniqueIp();

      for (let i = 0; i < 5; i++) {
        const res = await request(server)
          .post('/auth/login')
          .set('X-Test-Client-Ip', ip)
          .send({ email: uniqueEmail('ip-allow'), password: 'WrongPassword1' });
        expect(res.status).not.toBe(429);
      }
    });

    it('blocks the 6th attempt from the same IP with 429', async () => {
      const ip = uniqueIp();

      for (let i = 0; i < 5; i++) {
        await request(server)
          .post('/auth/login')
          .set('X-Test-Client-Ip', ip)
          .send({ email: uniqueEmail('ip-block'), password: 'WrongPassword1' });
      }

      const res = await request(server)
        .post('/auth/login')
        .set('X-Test-Client-Ip', ip)
        .send({ email: uniqueEmail('ip-block'), password: 'WrongPassword1' });

      expect(res.status).toBe(429);
    });
  });

  describe('login — email bucket', () => {
    it('blocks the 6th attempt against the same normalized email, even from 6 different IPs', async () => {
      const email = uniqueEmail('email-block');

      for (let i = 0; i < 5; i++) {
        const res = await request(server)
          .post('/auth/login')
          .set('X-Test-Client-Ip', uniqueIp())
          .send({ email, password: 'WrongPassword1' });
        expect(res.status).not.toBe(429);
      }

      const res = await request(server)
        .post('/auth/login')
        .set('X-Test-Client-Ip', uniqueIp())
        .send({ email, password: 'WrongPassword1' });

      expect(res.status).toBe(429);
    });

    it('treats differently-cased/whitespace-padded emails as the same bucket', async () => {
      const base = uniqueEmail('normalize');
      const variants = [base, base.toUpperCase(), base, base.toUpperCase()];

      for (const variant of variants) {
        const res = await request(server)
          .post('/auth/login')
          .set('X-Test-Client-Ip', uniqueIp())
          .send({ email: variant, password: 'WrongPassword1' });
        expect(res.status).not.toBe(429);
      }

      await request(server)
        .post('/auth/login')
        .set('X-Test-Client-Ip', uniqueIp())
        .send({ email: base, password: 'WrongPassword1' });

      const res = await request(server)
        .post('/auth/login')
        .set('X-Test-Client-Ip', uniqueIp())
        .send({ email: `  ${base}  `, password: 'WrongPassword1' });

      expect(res.status).toBe(429);
    });

    it("does not let a different email's attempts consume this email's bucket", async () => {
      const targetEmail = uniqueEmail('target');
      const otherEmail = uniqueEmail('other');

      for (let i = 0; i < 5; i++) {
        await request(server)
          .post('/auth/login')
          .set('X-Test-Client-Ip', uniqueIp())
          .send({ email: otherEmail, password: 'WrongPassword1' });
      }
      const otherRes = await request(server)
        .post('/auth/login')
        .set('X-Test-Client-Ip', uniqueIp())
        .send({ email: otherEmail, password: 'WrongPassword1' });
      expect(otherRes.status).toBe(429);

      const res = await request(server)
        .post('/auth/login')
        .set('X-Test-Client-Ip', uniqueIp())
        .send({ email: targetEmail, password: 'WrongPassword1' });

      expect(res.status).not.toBe(429);
    });

    it('does not let rotating IPs bypass the email bucket (the core credential-stuffing defense)', async () => {
      const email = uniqueEmail('rotate');

      for (let i = 0; i < 5; i++) {
        const res = await request(server)
          .post('/auth/login')
          .set('X-Test-Client-Ip', uniqueIp())
          .send({ email, password: 'WrongPassword1' });
        expect(res.status).not.toBe(429);
      }

      const res = await request(server)
        .post('/auth/login')
        .set('X-Test-Client-Ip', uniqueIp())
        .send({ email, password: 'WrongPassword1' });

      expect(res.status).toBe(429);
    });
  });

  describe('login — 429 response shape', () => {
    it('exposes retry information in both the Retry-After header and the JSON body', async () => {
      const ip = uniqueIp();
      const email = uniqueEmail('retry-info');

      for (let i = 0; i < 5; i++) {
        await request(server)
          .post('/auth/login')
          .set('X-Test-Client-Ip', ip)
          .send({ email, password: 'WrongPassword1' });
      }

      const res = await request(server)
        .post('/auth/login')
        .set('X-Test-Client-Ip', ip)
        .send({ email, password: 'WrongPassword1' });

      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);

      const body = res.body as ErrorResponseBody;
      expect(body.details?.retryAfterSeconds).toBeDefined();
      expect(body.details?.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe('register', () => {
    it('allows 5 attempts from the same IP', async () => {
      const ip = uniqueIp();

      for (let i = 0; i < 5; i++) {
        const res = await request(server)
          .post('/auth/register')
          .set('X-Test-Client-Ip', ip)
          .send({
            email: uniqueEmail('register-allow'),
            password: PASSWORD,
            firstName: 'RateLimit',
            lastName: 'Test',
          });
        expect(res.status).not.toBe(429);
      }
    });

    it('blocks the 6th attempt from the same IP with 429', async () => {
      const ip = uniqueIp();

      for (let i = 0; i < 5; i++) {
        await request(server)
          .post('/auth/register')
          .set('X-Test-Client-Ip', ip)
          .send({
            email: uniqueEmail('register-block'),
            password: PASSWORD,
            firstName: 'RateLimit',
            lastName: 'Test',
          });
      }

      const res = await request(server)
        .post('/auth/register')
        .set('X-Test-Client-Ip', ip)
        .send({
          email: uniqueEmail('register-block'),
          password: PASSWORD,
          firstName: 'RateLimit',
          lastName: 'Test',
        });

      expect(res.status).toBe(429);
    });

    it('lets a different IP register independently, unaffected by another IP being exhausted', async () => {
      const exhaustedIp = uniqueIp();
      const freshIp = uniqueIp();

      for (let i = 0; i < 5; i++) {
        await request(server)
          .post('/auth/register')
          .set('X-Test-Client-Ip', exhaustedIp)
          .send({
            email: uniqueEmail('register-exhaust'),
            password: PASSWORD,
            firstName: 'RateLimit',
            lastName: 'Test',
          });
      }
      const exhaustedRes = await request(server)
        .post('/auth/register')
        .set('X-Test-Client-Ip', exhaustedIp)
        .send({
          email: uniqueEmail('register-exhaust'),
          password: PASSWORD,
          firstName: 'RateLimit',
          lastName: 'Test',
        });
      expect(exhaustedRes.status).toBe(429);

      const freshRes = await request(server)
        .post('/auth/register')
        .set('X-Test-Client-Ip', freshIp)
        .send({
          email: uniqueEmail('register-fresh'),
          password: PASSWORD,
          firstName: 'RateLimit',
          lastName: 'Test',
        });
      expect(freshRes.status).not.toBe(429);
    });
  });

  describe('refresh — unaffected by rate limiting', () => {
    it('existing refresh behavior remains unchanged (no throttling applied to this route)', async () => {
      const email = uniqueEmail('refresh-unchanged');

      const registerRes = await request(server)
        .post('/auth/register')
        .set('X-Test-Client-Ip', uniqueIp())
        .send({
          email,
          password: PASSWORD,
          firstName: 'RateLimit',
          lastName: 'Test',
        });
      expect(registerRes.status).toBe(201);

      let lastRefreshToken = (registerRes.body as RegisterResponseBody)
        .refreshToken;

      for (let i = 0; i < 6; i++) {
        const res = await request(server)
          .post('/auth/refresh')
          .send({ refreshToken: lastRefreshToken });
        expect(res.status).toBe(200);
        lastRefreshToken = (res.body as RefreshResponseBody).refreshToken;
      }
    });
  });
});
