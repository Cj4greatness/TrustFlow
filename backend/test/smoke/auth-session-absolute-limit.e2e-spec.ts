import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { envValidationSchema } from '../../src/config/env.validation';
import configuration from '../../src/config/configuration';
import { AddSessionStartedAtColumn1794432000000 } from '../../src/database/migrations/1794432000000-AddSessionStartedAtColumn';
import { PasswordService } from '../../src/security/password.service';
import { User } from '../../src/users/entities/user.entity';
import { UsersRepository } from '../../src/users/users.repository';

interface ErrorResponseBody {
  message: string | string[];
  statusCode: number;
  details?: { code?: string };
}

interface RefreshResponseBody {
  accessToken: string;
  refreshToken: string;
}

describe('Auth — 30-day absolute session lifetime (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let usersRepository: UsersRepository;
  let dataSource: DataSource;
  let passwordService: PasswordService;
  let maxLifetimeMs: number;

  const runId = randomUUID().slice(0, 8);
  const password = 'SecurePass123';

  const register = async (label: string) => {
    return app.get(AuthService).register({
      email: `absolute-${label}.${runId}@example.com`,
      password,
      firstName: 'Absolute',
      lastName: 'Lifetime',
    });
  };

  const refresh = (token: string) =>
    request(server).post('/auth/refresh').send({ refreshToken: token });

  const expectLifetimeExpired = (response: {
    status: number;
    body: ErrorResponseBody;
  }) => {
    expect(response.status).toBe(401);
    expect(response.body.details?.code).toBe('SESSION_MAX_LIFETIME_EXCEEDED');
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
    dataSource = app.get(DataSource);
    passwordService = app.get(PasswordService);
    maxLifetimeMs =
      app.get(ConfigService).get<number>('session.maxLifetimeDays', 30) *
      24 *
      60 *
      60 *
      1000;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('sets session start on register/login and preserves it during refresh', async () => {
    const registered = await register('register-login-refresh');
    const registeredUser = await usersRepository.findById(registered.user.id);
    expect(registeredUser?.sessionStartedAt).toBeInstanceOf(Date);

    const oldSessionStart = new Date(Date.now() - maxLifetimeMs / 2);
    await usersRepository.update(registered.user.id, {
      sessionStartedAt: oldSessionStart,
    });
    const login = await app.get(AuthService).login({
      email: registered.user.email,
      password,
    });
    const loggedInUser = await usersRepository.findById(registered.user.id);
    expect(loggedInUser?.sessionStartedAt).toBeInstanceOf(Date);
    expect(loggedInUser!.sessionStartedAt!.getTime()).toBeGreaterThan(
      oldSessionStart.getTime(),
    );
    const sessionStartedAt = loggedInUser!.sessionStartedAt!.getTime();

    const response = await refresh(login.refreshToken);
    expect(response.status).toBe(200);
    const refreshedUser = await usersRepository.findById(registered.user.id);
    expect(refreshedUser?.sessionStartedAt?.getTime()).toBe(sessionStartedAt);
  });

  it('allows a session a few seconds before the boundary and rejects at or past it, wiping session state', async () => {
    const beforeBoundary = await register('before-boundary');
    await usersRepository.update(beforeBoundary.user.id, {
      sessionStartedAt: new Date(Date.now() - maxLifetimeMs + 5000),
    });
    expect((await refresh(beforeBoundary.refreshToken)).status).toBe(200);

    const exactBoundary = await register('exact-boundary');
    const exactNow = Date.now();
    await usersRepository.update(exactBoundary.user.id, {
      sessionStartedAt: new Date(exactNow - maxLifetimeMs),
    });
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(exactNow);
    try {
      expectLifetimeExpired(await refresh(exactBoundary.refreshToken));
    } finally {
      dateNowSpy.mockRestore();
    }

    for (const [label, offset] of [['past-boundary', -1000]] as const) {
      const expired = await register(label);
      await usersRepository.update(expired.user.id, {
        sessionStartedAt: new Date(Date.now() - maxLifetimeMs + offset),
      });

      expectLifetimeExpired(await refresh(expired.refreshToken));
      const user = await usersRepository.findById(expired.user.id);
      expect(user?.refreshTokenHash).toBeNull();
      expect(user?.sessionStartedAt).toBeNull();
      expect(user?.previousRefreshTokenHash).toBeNull();
      expect(user?.displacedRefreshTokenHash).toBeNull();
    }
  });

  it('rotates near day 29 without resetting the start and rejects a later refresh past day 30', async () => {
    const registered = await register('day-29');
    const startedAt = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    await usersRepository.update(registered.user.id, {
      sessionStartedAt: startedAt,
    });

    const first = await refresh(registered.refreshToken);
    expect(first.status).toBe(200);
    const afterRotation = await usersRepository.findById(registered.user.id);
    expect(afterRotation?.sessionStartedAt?.getTime()).toBe(
      startedAt.getTime(),
    );

    await usersRepository.update(registered.user.id, {
      sessionStartedAt: new Date(Date.now() - maxLifetimeMs - 1000),
    });
    expectLifetimeExpired(
      await refresh((first.body as RefreshResponseBody).refreshToken),
    );
  });

  it('allows at most one concurrent refresh before expiry and none at or after expiry', async () => {
    const live = await register('concurrent-live');
    await usersRepository.update(live.user.id, {
      sessionStartedAt: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000),
    });
    const liveResults = await Promise.all([
      refresh(live.refreshToken),
      refresh(live.refreshToken),
    ]);
    expect(liveResults.map((result) => result.status).sort()).toEqual([
      200, 401,
    ]);
    const loser = liveResults.find((result) => result.status === 401)!;
    expect((loser.body as ErrorResponseBody).details?.code).toBe(
      'REFRESH_TOKEN_RECENTLY_ROTATED',
    );

    const expired = await register('concurrent-expired');
    await usersRepository.update(expired.user.id, {
      sessionStartedAt: new Date(Date.now() - maxLifetimeMs),
    });
    const expiredResults = await Promise.all([
      refresh(expired.refreshToken),
      refresh(expired.refreshToken),
    ]);
    expect(expiredResults.every((result) => result.status === 401)).toBe(true);
    expect(
      expiredResults.some(
        (result) =>
          (result.body as ErrorResponseBody).details?.code ===
          'SESSION_MAX_LIFETIME_EXCEEDED',
      ),
    ).toBe(true);
    const expiredUser = await usersRepository.findById(expired.user.id);
    expect(expiredUser?.refreshTokenHash).toBeNull();
    expect(expiredUser?.sessionStartedAt).toBeNull();
  });

  it('does not let the 10-second grace path bypass a session expiring after the early check', async () => {
    const registered = await register('grace-expiry');
    const rotated = await refresh(registered.refreshToken);
    expect(rotated.status).toBe(200);

    let lookupCount = 0;
    const findSpy = jest
      .spyOn(usersRepository, 'findById')
      .mockImplementation(async (id: string): Promise<User | null> => {
        const user = await dataSource.getRepository(User).findOne({
          where: { id },
        });
        lookupCount += 1;
        if (lookupCount === 1) {
          await dataSource.query(
            'UPDATE "users" SET "session_started_at" = $1 WHERE "id" = $2',
            [new Date(Date.now() - maxLifetimeMs - 1000), id],
          );
        }
        return user;
      });

    try {
      expectLifetimeExpired(await refresh(registered.refreshToken));
    } finally {
      findSpy.mockRestore();
    }

    const user = await usersRepository.findById(registered.user.id);
    expect(user?.refreshTokenHash).toBeNull();
    expect(user?.sessionStartedAt).toBeNull();
  });

  it('rejects a CAS whose cutoff makes the existing session expired without writing', async () => {
    const registered = await register('cas-expired');
    const userBefore = await usersRepository.findById(registered.user.id);
    const newHash = await passwordService.hash('replacement-refresh-hash');

    const won = await usersRepository.rotateRefreshTokenHash(
      registered.user.id,
      userBefore!.refreshTokenHash!,
      newHash,
      new Date(Date.now() + 1000),
    );

    expect(won).toBe(false);
    const userAfter = await usersRepository.findById(registered.user.id);
    expect(userAfter?.refreshTokenHash).toBe(userBefore?.refreshTokenHash);
    expect(userAfter?.sessionStartedAt?.getTime()).toBe(
      userBefore?.sessionStartedAt?.getTime(),
    );
  });

  it('keeps displaced sessions rejected and gives the new login a fresh lifetime', async () => {
    const first = await register('displaced');
    await usersRepository.update(first.user.id, {
      sessionStartedAt: new Date(Date.now() - maxLifetimeMs / 2),
    });
    const oldStart = (await usersRepository.findById(
      first.user.id,
    ))!.sessionStartedAt!.getTime();

    const second = await app.get(AuthService).login({
      email: first.user.email,
      password,
    });
    const current = await usersRepository.findById(first.user.id);
    expect(current?.sessionStartedAt?.getTime()).toBeGreaterThan(oldStart);

    const oldSession = await refresh(first.refreshToken);
    expect(oldSession.status).toBe(401);
    expect((oldSession.body as ErrorResponseBody).details?.code).toBe(
      'SESSION_REPLACED_BY_NEW_LOGIN',
    );
    expect((await refresh(second.refreshToken)).status).toBe(200);
  });

  it('fails closed and wipes a legacy session with a hash but no start timestamp', async () => {
    const registered = await register('legacy-null-start');
    await usersRepository.update(registered.user.id, {
      sessionStartedAt: null,
    });

    expectLifetimeExpired(await refresh(registered.refreshToken));
    const user = await usersRepository.findById(registered.user.id);
    expect(user?.refreshTokenHash).toBeNull();
    expect(user?.sessionStartedAt).toBeNull();
  });

  it('clears session_started_at on logout', async () => {
    const registered = await register('logout');
    expect(
      (await usersRepository.findById(registered.user.id))?.sessionStartedAt,
    ).toBeInstanceOf(Date);

    await app.get(AuthService).logout(registered.user.id);
    const loggedOut = await usersRepository.findById(registered.user.id);
    expect(loggedOut?.refreshTokenHash).toBeNull();
    expect(loggedOut?.sessionStartedAt).toBeNull();
  });

  it('runs the migration up/down on a temporary users table and proves its backfill', async () => {
    const queryRunner = dataSource.createQueryRunner();
    const migration = new AddSessionStartedAtColumn1794432000000();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`
        CREATE TEMP TABLE "users" (
          "id" integer PRIMARY KEY,
          "refresh_token_hash" varchar NULL,
          "last_login" timestamptz NULL,
          "created_at" timestamptz NOT NULL
        ) ON COMMIT DROP
      `);
      await queryRunner.query(
        `INSERT INTO "users" ("id", "refresh_token_hash", "last_login", "created_at")
         VALUES
          (1, 'hash-login', '2026-01-02T03:04:05Z', '2025-01-01T00:00:00Z'),
          (2, 'hash-created', NULL, '2025-02-03T04:05:06Z'),
          (3, NULL, '2026-03-04T05:06:07Z', '2025-03-01T00:00:00Z')`,
      );

      await migration.up(queryRunner);
      const rows = (await queryRunner.query(
        `SELECT "id", "session_started_at" FROM "users" ORDER BY "id"`,
      )) as Array<{ id: number; session_started_at: Date | null }>;
      expect(new Date(rows[0].session_started_at!).toISOString()).toBe(
        '2026-01-02T03:04:05.000Z',
      );
      expect(new Date(rows[1].session_started_at!).toISOString()).toBe(
        '2025-02-03T04:05:06.000Z',
      );
      expect(rows[2].session_started_at).toBeNull();

      await migration.down(queryRunner);
      const columnExists = (await queryRunner.query(`
        SELECT EXISTS (
          SELECT 1
          FROM pg_attribute
          WHERE attrelid = 'users'::regclass
            AND attname = 'session_started_at'
            AND NOT attisdropped
        ) AS exists
      `)) as Array<{ exists: boolean }>;
      expect(columnExists[0].exists).toBe(false);
    } finally {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
    }
  });

  it('defaults the lifetime to 30 days and rejects invalid configured values', () => {
    const lifetimeSchema = envValidationSchema.extract(
      'SESSION_MAX_LIFETIME_DAYS',
    );
    expect(lifetimeSchema.validate(undefined).value).toBe(30);
    for (const invalid of ['', 'abc', '0', '-1', '1.5', '366']) {
      const result = lifetimeSchema.validate(invalid);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('SESSION_MAX_LIFETIME_DAYS');
    }
    expect(lifetimeSchema.validate('1').error).toBeUndefined();
    expect(lifetimeSchema.validate('365').error).toBeUndefined();

    const previousValue = process.env.SESSION_MAX_LIFETIME_DAYS;
    try {
      delete process.env.SESSION_MAX_LIFETIME_DAYS;
      expect(configuration().session.maxLifetimeDays).toBe(30);
    } finally {
      if (previousValue === undefined) {
        delete process.env.SESSION_MAX_LIFETIME_DAYS;
      } else {
        process.env.SESSION_MAX_LIFETIME_DAYS = previousValue;
      }
    }
  });
});
