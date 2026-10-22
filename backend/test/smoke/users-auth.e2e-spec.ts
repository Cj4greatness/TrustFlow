import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

/**
 * Users — authentication & self-only access (e2e)
 *
 * Regression suite for a critical gap: UsersController had no guard,
 * so GET/PATCH/DELETE /users/:id worked for ANONYMOUS callers against
 * any user id. The anonymous cases below are the actual vulnerability
 * — do not weaken them.
 */
describe('Users — authentication & self-only access (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  const runId = randomUUID().slice(0, 8);
  const PASSWORD = 'SecurePass123';

  let aliceId: string;
  let aliceToken: string;
  let bobId: string;
  let bobToken: string;

  const register = async (email: string, firstName: string) => {
    const { user, accessToken } = await app.get(AuthService).register({
      email,
      password: PASSWORD,
      firstName,
      lastName: 'Test',
    });
    return { id: user.id, token: accessToken };
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

    const alice = await register(`alice.${runId}@example.com`, 'Alice');
    aliceId = alice.id;
    aliceToken = alice.token;
    const bob = await register(`bob.${runId}@example.com`, 'Bob');
    bobId = bob.id;
    bobToken = bob.token;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('rejects an anonymous GET /users/:id with 401', async () => {
    await request(server).get(`/users/${aliceId}`).expect(401);
  });

  it('rejects an anonymous PATCH /users/:id with 401 and changes nothing', async () => {
    await request(server)
      .patch(`/users/${aliceId}`)
      .send({ firstName: 'Hijacked' })
      .expect(401);

    const res = await request(server)
      .get(`/users/${aliceId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect((res.body as { firstName: string }).firstName).toBe('Alice');
  });

  it('rejects an anonymous DELETE /users/:id with 401 and deletes nothing', async () => {
    await request(server).delete(`/users/${aliceId}`).expect(401);
    await request(server)
      .get(`/users/${aliceId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
  });

  it("forbids an authenticated user from reading another user's record", async () => {
    await request(server)
      .get(`/users/${aliceId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(403);
  });

  it("forbids an authenticated user from updating another user's record", async () => {
    await request(server)
      .patch(`/users/${aliceId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ firstName: 'Hijacked' })
      .expect(403);

    const res = await request(server)
      .get(`/users/${aliceId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect((res.body as { firstName: string }).firstName).toBe('Alice');
  });

  it("forbids an authenticated user from deleting another user's record", async () => {
    await request(server)
      .delete(`/users/${aliceId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(403);
    await request(server)
      .get(`/users/${aliceId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
  });

  it('lets a user read and update their own record', async () => {
    await request(server)
      .get(`/users/${bobId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);

    const res = await request(server)
      .patch(`/users/${bobId}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ firstName: 'Robert' })
      .expect(200);
    expect((res.body as { firstName: string }).firstName).toBe('Robert');
  });
});
