import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { AuthService } from '../../src/auth/auth.service';
import { UsersRepository } from '../../src/users/users.repository';

interface ErrorResponseBody {
  message: string | string[];
  statusCode: number;
  details?: {
    code?: string;
  };
}

interface RefreshResponseBody {
  accessToken: string;
  refreshToken: string;
}

describe('Auth — Refresh Token Rotation Concurrency (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let usersRepository: UsersRepository;

  const runId = randomUUID().slice(0, 8);
  const PASSWORD = 'SecurePass123';

  const registerAndLogin = async (
    email: string,
    firstName: string,
  ): Promise<{ userId: string; refreshToken: string }> => {
    const authService = app.get(AuthService);
    const { user, refreshToken } = await authService.register({
      email,
      password: PASSWORD,
      firstName,
      lastName: 'Test',
    });
    return { userId: user.id, refreshToken };
  };

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
    usersRepository = app.get(UsersRepository);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('exactly one of two concurrent refresh() calls with the same token succeeds, session stays usable', async () => {
    const { refreshToken } = await registerAndLogin(
      `rr-concurrent.${runId}@example.com`,
      'Concurrent',
    );

    const [resA, resB] = await Promise.all([
      request(server).post('/auth/refresh').send({ refreshToken }),
      request(server).post('/auth/refresh').send({ refreshToken }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 401]);

    const loser = resA.status === 401 ? resA : resB;
    const loserBody = loser.body as ErrorResponseBody;
    expect(loserBody.details?.code).toBe('REFRESH_TOKEN_RECENTLY_ROTATED');

    const winner = resA.status === 200 ? resA : resB;
    const winnerBody = winner.body as RefreshResponseBody;

    // Session must still be usable — a subsequent refresh with the
    // winning token succeeds, proving the race didn't wipe the session.
    const followUp = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: winnerBody.refreshToken });

    expect(followUp.status).toBe(200);
  });

  it('a stale token presented after the recently-rotated window still wipes the session (theft path unchanged)', async () => {
    const { userId, refreshToken } = await registerAndLogin(
      `rr-stale.${runId}@example.com`,
      'Stale',
    );

    const rotateRes = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken });
    expect(rotateRes.status).toBe(200);
    const rotatedBody = rotateRes.body as RefreshResponseBody;

    // Backdate refreshTokenRotatedAt past the 10s grace window, so the
    // stale replay below is treated as arriving late rather than as
    // part of the original race — without a real sleep in the suite.
    await usersRepository.update(userId, {
      refreshTokenRotatedAt: new Date(Date.now() - 11_000),
    });

    const staleRes = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken }); // the original, now-stale token

    expect(staleRes.status).toBe(401);
    const staleBody = staleRes.body as ErrorResponseBody;
    expect(staleBody.details?.code).toBeUndefined();

    // Confirm the session was actually wiped: even the winning
    // rotated token from earlier no longer works.
    const postWipeRes = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: rotatedBody.refreshToken });

    expect(postWipeRes.status).toBe(401);
  });

  it('a login from another device displaces the first session, with a distinguishable reason on its next refresh', async () => {
    const authService = app.get(AuthService);
    const email = `rr-displaced.${runId}@example.com`;

    // "Device A" — registering creates the first session.
    const deviceA = await authService.register({
      email,
      password: PASSWORD,
      firstName: 'Displaced',
      lastName: 'Test',
    });

    // "Device B" — logging in with the same credentials displaces Device A's session.
    const deviceB = await authService.login({ email, password: PASSWORD });

    // Device A's refresh token should now be recognized as displaced,
    // not treated as generic theft.
    const deviceARes = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: deviceA.refreshToken });

    expect(deviceARes.status).toBe(401);
    const deviceABody = deviceARes.body as ErrorResponseBody;
    expect(deviceABody.details?.code).toBe('SESSION_REPLACED_BY_NEW_LOGIN');

    // Device B's session must be unaffected — it's the one that won.
    const deviceBRes = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: deviceB.refreshToken });

    expect(deviceBRes.status).toBe(200);
  });
});
