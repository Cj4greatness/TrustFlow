import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { User, UserStatus } from '../../src/users/entities/user.entity';

interface LoginResponseBody {
  accessToken?: string;
  refreshToken?: string;
}

interface ErrorResponseBody {
  message: string | string[];
  statusCode: number;
  details?: { code?: string };
}

describe('Auth — login enforces UserStatus (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let dataSource: DataSource;

  const runId = randomUUID().slice(0, 8);
  const password = 'SecurePass123';
  let rateLimitIpCounter = 0;

  const createUser = async (label: string) =>
    app.get(AuthService).register({
      email: `login-status-${label}.${runId}@example.com`,
      password,
      firstName: 'Status',
      lastName: 'Test',
    });

  const login = (email: string, submittedPassword = password) =>
    request(server)
      .post('/auth/login')
      .set('X-Test-Client-Ip', nextTestIp())
      .send({
        email,
        password: submittedPassword,
      });

  const nextTestIp = () => {
    rateLimitIpCounter += 1;
    return `10.98.${Math.floor(rateLimitIpCounter / 250)}.${rateLimitIpCounter % 250}`;
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
    dataSource = app.get(DataSource);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('allows an active user to log in, issue tokens, and update lastLogin', async () => {
    const registered = await createUser('active');
    const users = dataSource.getRepository(User);
    await users.update(
      { id: registered.user.id },
      { lastLogin: new Date('2000-01-01T00:00:00.000Z') },
    );

    const response = await login(registered.user.email);

    expect(response.status).toBe(200);
    const body = response.body as LoginResponseBody;
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
    const updatedUser = await users.findOneByOrFail({ id: registered.user.id });
    expect(updatedUser.status).toBe(UserStatus.ACTIVE);
    expect(updatedUser.lastLogin?.getTime()).toBeGreaterThan(
      new Date('2000-01-01T00:00:00.000Z').getTime(),
    );
  });

  it.each([UserStatus.INVITED, UserStatus.SUSPENDED, UserStatus.DEACTIVATED])(
    'rejects a correct-password login for %s without changing session fields',
    async (status) => {
      const registered = await createUser(`inactive-${status}`);
      const authService = app.get(AuthService);
      await authService.login({
        email: registered.user.email,
        password,
      });

      const users = dataSource.getRepository(User);
      await users.update({ id: registered.user.id }, { status });
      const before = await users.findOneByOrFail({ id: registered.user.id });

      const response = await login(registered.user.email);
      expect(response.status).toBe(403);
      expect((response.body as ErrorResponseBody).details?.code).toBe(
        'ACCOUNT_NOT_ACTIVE',
      );
      expect(response.body).not.toHaveProperty('accessToken');
      expect(response.body).not.toHaveProperty('refreshToken');
      expect(JSON.stringify(response.body)).not.toContain(status);

      const after = await users.findOneByOrFail({ id: registered.user.id });
      expect(after.lastLogin?.getTime()).toBe(before.lastLogin?.getTime());
      expect(after.refreshTokenHash).toBe(before.refreshTokenHash);
      expect(after.displacedRefreshTokenHash).toBe(
        before.displacedRefreshTokenHash,
      );
      expect(after.displacedAt?.getTime()).toBe(before.displacedAt?.getTime());
    },
  );

  it('returns the same generic 401 for a wrong password, regardless of status or account existence', async () => {
    const active = await createUser('wrong-password-active');
    const inactive = await createUser('wrong-password-inactive');
    await dataSource
      .getRepository(User)
      .update({ id: inactive.user.id }, { status: UserStatus.SUSPENDED });

    const activeWrongPassword = await login(active.user.email, 'WrongPass123');
    const inactiveWrongPassword = await login(
      inactive.user.email,
      'WrongPass123',
    );
    const unknownEmail = await login(
      `unknown.${runId}@example.com`,
      'WrongPass123',
    );
    const activeWrongBody = activeWrongPassword.body as ErrorResponseBody;
    const inactiveWrongBody = inactiveWrongPassword.body as ErrorResponseBody;
    const unknownEmailBody = unknownEmail.body as ErrorResponseBody;

    for (const response of [
      activeWrongPassword,
      inactiveWrongPassword,
      unknownEmail,
    ]) {
      expect(response.status).toBe(401);
      expect((response.body as ErrorResponseBody).message).toBe(
        'Invalid email or password',
      );
      expect((response.body as ErrorResponseBody).details).toBeUndefined();
    }
    expect(inactiveWrongBody).toMatchObject({
      message: activeWrongBody.message,
      statusCode: activeWrongBody.statusCode,
    });
    expect(unknownEmailBody).toMatchObject({
      message: activeWrongBody.message,
      statusCode: activeWrongBody.statusCode,
    });
  });

  it('does not displace an existing session when the user becomes non-active', async () => {
    const registered = await createUser('session-preserved');
    await app.get(AuthService).login({
      email: registered.user.email,
      password,
    });

    const users = dataSource.getRepository(User);
    await users.update(
      { id: registered.user.id },
      { status: UserStatus.DEACTIVATED },
    );
    const before = await users.findOneByOrFail({ id: registered.user.id });

    const response = await login(registered.user.email);
    expect(response.status).toBe(403);
    expect((response.body as ErrorResponseBody).details?.code).toBe(
      'ACCOUNT_NOT_ACTIVE',
    );

    const after = await users.findOneByOrFail({ id: registered.user.id });
    expect(after.refreshTokenHash).toBe(before.refreshTokenHash);
    expect(after.displacedRefreshTokenHash).toBe(
      before.displacedRefreshTokenHash,
    );
    expect(after.displacedAt?.getTime()).toBe(before.displacedAt?.getTime());
    expect(after.lastLogin?.getTime()).toBe(before.lastLogin?.getTime());
  });

  it('continues to reject soft-deleted users', async () => {
    const registered = await createUser('soft-deleted');
    await dataSource.getRepository(User).softDelete({ id: registered.user.id });

    const response = await login(registered.user.email);

    expect(response.status).toBe(401);
    expect((response.body as ErrorResponseBody).message).toBe(
      'Invalid email or password',
    );
    expect((response.body as ErrorResponseBody).details).toBeUndefined();
  });

  it('counts non-active login failures toward the existing email throttle', async () => {
    const registered = await createUser('rate-limited');
    await dataSource
      .getRepository(User)
      .update({ id: registered.user.id }, { status: UserStatus.INVITED });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(server)
        .post('/auth/login')
        .set('X-Test-Client-Ip', nextTestIp())
        .send({ email: registered.user.email, password });
      expect(response.status).toBe(403);
    }

    const sixthAttempt = await request(server)
      .post('/auth/login')
      .set('X-Test-Client-Ip', nextTestIp())
      .send({ email: registered.user.email, password });
    expect(sixthAttempt.status).toBe(429);
  });
});
