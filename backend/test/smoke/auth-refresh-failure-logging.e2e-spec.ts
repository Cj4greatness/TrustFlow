import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { User } from '../../src/users/entities/user.entity';
import { UsersRepository } from '../../src/users/users.repository';

interface AuthResponseBody {
  accessToken: string;
  refreshToken: string;
}

interface ErrorResponseBody {
  message: string;
  statusCode: number;
  details?: { code?: string };
}

interface RefreshFailureEvent {
  event: string;
  reason: string;
  classification: 'expected' | 'suspicious';
  userId?: string;
  ip: string;
  userAgent: string;
  timestamp: string;
}

describe('Auth — Refresh Failure Security Logging (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let dataSource: DataSource;
  let usersRepository: UsersRepository;
  let authService: AuthService;
  let warnSpy: jest.SpyInstance;
  let emittedLogs: Array<{
    classification: 'expected' | 'suspicious';
    message: unknown;
  }>;

  const runId = randomUUID().slice(0, 8);
  const password = 'SecurePass123';
  const clientIp = '10.77.0.1';
  const userAgent = 'refresh-failure-logging-e2e';
  let accountNumber = 0;

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
    dataSource = app.get(DataSource);
    usersRepository = app.get(UsersRepository);
    authService = app.get(AuthService);
  }, 30000);

  beforeEach(() => {
    emittedLogs = [];
    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((message: unknown) => {
        emittedLogs.push({ classification: 'expected', message });
      });
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((message: unknown) => {
        emittedLogs.push({ classification: 'suspicious', message });
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createSession(): Promise<{
    userId: string;
    email: string;
    refreshToken: string;
  }> {
    accountNumber += 1;
    const email = `refresh-log-${runId}-${accountNumber}@example.com`;
    const result = await authService.register({
      email,
      password,
      firstName: 'Refresh',
      lastName: 'Logging',
    });
    return {
      userId: result.user.id,
      email,
      refreshToken: result.refreshToken,
    };
  }

  async function refresh(
    token: string,
    agent = userAgent,
  ): Promise<request.Response> {
    return request(server)
      .post('/auth/refresh')
      .set('x-test-client-ip', clientIp)
      .set('user-agent', agent)
      .send({ refreshToken: token });
  }

  function loggedFailureEvents(): RefreshFailureEvent[] {
    const events: RefreshFailureEvent[] = [];
    for (const { message } of emittedLogs) {
      if (typeof message !== 'string') {
        continue;
      }
      try {
        const parsed: unknown = JSON.parse(message);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'event' in parsed &&
          parsed.event === 'auth.refresh_failed' &&
          'reason' in parsed &&
          typeof parsed.reason === 'string' &&
          'classification' in parsed &&
          (parsed.classification === 'expected' ||
            parsed.classification === 'suspicious') &&
          'ip' in parsed &&
          typeof parsed.ip === 'string' &&
          'userAgent' in parsed &&
          typeof parsed.userAgent === 'string' &&
          'timestamp' in parsed &&
          typeof parsed.timestamp === 'string'
        ) {
          events.push(parsed);
        }
      } catch {
        continue;
      }
    }
    return events;
  }

  function expectFailureEvent(
    reason: string,
    classification: RefreshFailureEvent['classification'],
    secrets: Array<string | null | undefined>,
    expectedUserId?: string,
  ): void {
    const events = loggedFailureEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: 'auth.refresh_failed',
      reason,
      classification,
      ip: clientIp,
      userAgent,
    });
    expect(events[0].timestamp).toEqual(expect.any(String));
    if (expectedUserId) {
      expect(events[0].userId).toBe(expectedUserId);
    } else {
      expect(events[0]).not.toHaveProperty('userId');
    }
    expect(
      emittedLogs.filter((entry) => entry.classification === classification),
    ).toHaveLength(1);

    const serialized = JSON.stringify(events[0]);
    for (const secret of secrets) {
      if (secret) {
        expect(serialized).not.toContain(secret);
      }
    }
  }

  function expectGenericInvalidRefresh(
    response: request.Response,
  ): ErrorResponseBody {
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      message: 'Invalid or expired refresh token',
      statusCode: 401,
      path: '/auth/refresh',
    });
    return response.body as ErrorResponseBody;
  }

  async function currentRefreshHash(userId: string): Promise<string | null> {
    return (
      await dataSource.getRepository(User).findOneByOrFail({ id: userId })
    ).refreshTokenHash;
  }

  it('logs malformed refresh tokens as suspicious without changing the 401 response', async () => {
    const session = await createSession();
    const hash = await currentRefreshHash(session.userId);
    const malformedToken = 'not-a-refresh-token';

    const response = await refresh(malformedToken);

    expectGenericInvalidRefresh(response);
    expectFailureEvent('malformed_or_unverifiable_token', 'suspicious', [
      malformedToken,
      hash,
      session.email,
    ]);
  });

  it('logs expired refresh tokens as expected without changing the 401 response', async () => {
    const session = await createSession();
    const configService = app.get(ConfigService);
    const expiredToken = app.get(JwtService).sign(
      { sub: session.userId, email: session.email, jti: randomUUID() },
      {
        secret: configService.get<string>('jwt.refreshSecret'),
        expiresIn: -1,
      },
    );
    const hash = await currentRefreshHash(session.userId);

    const response = await refresh(expiredToken);

    expectGenericInvalidRefresh(response);
    expectFailureEvent('token_expired', 'expected', [
      expiredToken,
      hash,
      session.email,
    ]);
  });

  it('logs a missing or soft-deleted user as suspicious without changing the 401 response', async () => {
    const session = await createSession();
    const hash = await currentRefreshHash(session.userId);
    await usersRepository.softDelete(session.userId);

    const response = await refresh(session.refreshToken);

    expectGenericInvalidRefresh(response);
    expectFailureEvent('user_missing_or_deleted', 'suspicious', [
      session.refreshToken,
      hash,
      session.email,
    ]);
  });

  it('logs an unavailable refresh session as suspicious without changing the 401 response', async () => {
    const session = await createSession();
    await authService.logout(session.userId);

    const response = await refresh(session.refreshToken);

    expectGenericInvalidRefresh(response);
    expectFailureEvent(
      'refresh_token_session_unavailable',
      'suspicious',
      [session.refreshToken, session.email],
      session.userId,
    );
  });

  it('logs stale-token reuse outside the rotation window as suspicious and preserves the session wipe', async () => {
    const session = await createSession();
    const oldHash = await currentRefreshHash(session.userId);
    const rotationResponse = await refresh(session.refreshToken);
    expect(rotationResponse.status).toBe(200);
    const rotated = rotationResponse.body as AuthResponseBody;
    await usersRepository.update(session.userId, {
      refreshTokenRotatedAt: new Date(Date.now() - 11_000),
    });
    const currentHash = await currentRefreshHash(session.userId);

    const response = await refresh(session.refreshToken);

    expectGenericInvalidRefresh(response);
    expect(await currentRefreshHash(session.userId)).toBeNull();
    expectFailureEvent(
      'refresh_token_reuse_detected',
      'suspicious',
      [session.refreshToken, oldHash, currentHash, session.email],
      session.userId,
    );
    expect(rotated.refreshToken).not.toBe(session.refreshToken);
  });

  it('logs a lost concurrent refresh rotation as expected with the existing error code', async () => {
    const session = await createSession();
    const [first, second] = await Promise.all([
      refresh(session.refreshToken),
      refresh(session.refreshToken),
    ]);
    const loser = first.status === 401 ? first : second;
    const winner = first.status === 200 ? first : second;
    expect(winner.status).toBe(200);
    expect(loser.status).toBe(401);
    expect(loser.body).toMatchObject({
      success: false,
      message: 'Refresh token was already rotated by a concurrent request',
      statusCode: 401,
      details: { code: 'REFRESH_TOKEN_RECENTLY_ROTATED' },
    });

    const hash = await currentRefreshHash(session.userId);
    expectFailureEvent(
      'refresh_token_recently_rotated',
      'expected',
      [session.refreshToken, hash, session.email],
      session.userId,
    );
  });

  it('logs a displaced session as expected with the existing error code', async () => {
    const session = await createSession();
    const oldHash = await currentRefreshHash(session.userId);
    await authService.login({ email: session.email, password });
    const displacedHash = await currentRefreshHash(session.userId);

    const response = await refresh(session.refreshToken);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      message: 'This session was replaced by a login on another device',
      statusCode: 401,
      details: { code: 'SESSION_REPLACED_BY_NEW_LOGIN' },
    });
    expectFailureEvent(
      'session_replaced_by_new_login',
      'expected',
      [session.refreshToken, oldHash, displacedHash, session.email],
      session.userId,
    );
  });

  it('logs unexpected exceptions as suspicious without changing the generic 500 response', async () => {
    const session = await createSession();
    const hash = await currentRefreshHash(session.userId);
    const repositorySpy = jest
      .spyOn(usersRepository, 'findById')
      .mockRejectedValueOnce(new Error('Injected refresh lookup failure'));

    const response = await refresh(session.refreshToken);
    repositorySpy.mockRestore();

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({
      success: false,
      message: 'An unexpected error occurred',
      statusCode: 500,
      path: '/auth/refresh',
    });
    expectFailureEvent('unexpected_exception', 'suspicious', [
      session.refreshToken,
      hash,
      session.email,
    ]);
  });

  it('does not emit a failure event for a successful refresh', async () => {
    const { refreshToken } = await createSession();

    const response = await refresh(refreshToken);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('accessToken');
    expect(response.body).toHaveProperty('refreshToken');
    expect(loggedFailureEvents()).toHaveLength(0);
  });

  it('does not allow a logger failure to alter a refresh response', async () => {
    await createSession();
    warnSpy.mockImplementation(() => {
      throw new Error('Logger unavailable');
    });

    const response = await refresh('malformed-refresh-token');

    expectGenericInvalidRefresh(response);
  });

  it('truncates the user agent to 200 characters', async () => {
    await createSession();
    const longUserAgent = 'x'.repeat(240);

    const response = await refresh('malformed-refresh-token', longUserAgent);

    expectGenericInvalidRefresh(response);
    const event = loggedFailureEvents()[0];
    expect(event.userAgent).toBe('x'.repeat(200));
  });
});
