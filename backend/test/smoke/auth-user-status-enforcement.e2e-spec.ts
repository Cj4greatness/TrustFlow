import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { User, UserStatus } from '../../src/users/entities/user.entity';
import { UsersRepository } from '../../src/users/users.repository';

interface ErrorResponseBody {
  message: string;
  statusCode: number;
  details?: { code?: string };
}

interface RefreshFailureEvent {
  event: 'auth.refresh_failed';
  reason: string;
  classification: 'expected' | 'suspicious';
  userId?: string;
  ip: string;
  userAgent: string;
  timestamp: string;
}

describe('Auth — non-active user enforcement (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let dataSource: DataSource;
  let usersRepository: UsersRepository;
  let authService: AuthService;

  const runId = randomUUID().slice(0, 8);
  const password = 'SecurePass123';
  const userAgent = 'sec-04-status-enforcement';
  let emittedLogs: Array<{
    classification: 'expected' | 'suspicious';
    message: unknown;
  }>;

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
    jest
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

  function refreshFailureEvents(): RefreshFailureEvent[] {
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
            parsed.classification === 'suspicious')
        ) {
          events.push(parsed as RefreshFailureEvent);
        }
      } catch {
        continue;
      }
    }
    return events;
  }

  function sessionSnapshot(user: User) {
    return {
      refreshTokenHash: user.refreshTokenHash,
      sessionStartedAt: user.sessionStartedAt?.getTime() ?? null,
      previousRefreshTokenHash: user.previousRefreshTokenHash,
      displacedRefreshTokenHash: user.displacedRefreshTokenHash,
    };
  }

  it.each([UserStatus.INVITED, UserStatus.SUSPENDED, UserStatus.DEACTIVATED])(
    'blocks %s users at refresh and protected requests without clearing sessions',
    async (status) => {
      const account = await authService.register({
        email: `sec04-${status}.${runId}@example.com`,
        password,
        firstName: 'SEC04',
        lastName: 'Status',
      });
      const repository = dataSource.getRepository(User);
      await repository.update({ id: account.user.id }, { status });

      const before = await repository.findOneByOrFail({
        id: account.user.id,
      });

      const refreshResponse = await request(server)
        .post('/auth/refresh')
        .set('x-test-client-ip', '10.77.4.1')
        .set('user-agent', userAgent)
        .send({ refreshToken: account.refreshToken });

      expect(refreshResponse.status).toBe(403);
      expect((refreshResponse.body as ErrorResponseBody).details?.code).toBe(
        'ACCOUNT_NOT_ACTIVE',
      );

      const afterRefresh = await repository.findOneByOrFail({
        id: account.user.id,
      });
      expect(sessionSnapshot(afterRefresh)).toEqual(sessionSnapshot(before));

      const findByIdSpy = jest.spyOn(usersRepository, 'findById');
      const protectedResponse = await request(server)
        .get('/organizations/me')
        .set('Authorization', `Bearer ${account.accessToken}`);

      expect(protectedResponse.status).toBe(403);
      expect((protectedResponse.body as ErrorResponseBody).details?.code).toBe(
        'ACCOUNT_NOT_ACTIVE',
      );
      expect(findByIdSpy).toHaveBeenCalledTimes(1);

      const events = refreshFailureEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        event: 'auth.refresh_failed',
        reason: 'account_not_active',
        classification: 'expected',
        userId: account.user.id,
        ip: '10.77.4.1',
        userAgent,
      });

      await repository.update(
        { id: account.user.id },
        { status: UserStatus.ACTIVE },
      );

      const activeRefresh = await request(server)
        .post('/auth/refresh')
        .set('x-test-client-ip', '10.77.4.1')
        .set('user-agent', userAgent)
        .send({ refreshToken: account.refreshToken });
      expect(activeRefresh.status).toBe(200);

      const activeProtected = await request(server)
        .get('/organizations/me')
        .set('Authorization', `Bearer ${account.accessToken}`);
      expect(activeProtected.status).toBe(200);
    },
  );

  it('keeps ACTIVE users working for refresh and protected routes', async () => {
    const account = await authService.register({
      email: `sec04-active.${runId}@example.com`,
      password,
      firstName: 'SEC04',
      lastName: 'Active',
    });
    expect(
      (
        await dataSource
          .getRepository(User)
          .findOneByOrFail({ id: account.user.id })
      ).status,
    ).toBe(UserStatus.ACTIVE);

    const refreshResponse = await request(server)
      .post('/auth/refresh')
      .set('x-test-client-ip', '10.77.4.2')
      .set('user-agent', userAgent)
      .send({ refreshToken: account.refreshToken });
    expect(refreshResponse.status).toBe(200);

    const protectedResponse = await request(server)
      .get('/organizations/me')
      .set('Authorization', `Bearer ${account.accessToken}`);
    expect(protectedResponse.status).toBe(200);
  });
});
