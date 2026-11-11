import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from './entities/user.entity';

/**
 * Encapsulates all direct database access for User. UserService
 * calls through this rather than injecting Repository<User>
 * directly, keeping reusable queries (find by email, find active
 * users, etc.) defined in one place instead of scattered across
 * services as ad-hoc `.findOne({ where: ... })` calls.
 */
@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {}

  create(data: Partial<User>): User {
    return this.repository.create(data);
  }

  save(user: User): Promise<User> {
    return this.repository.save(user);
  }

  findById(id: string): Promise<User | null> {
    return this.repository.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({ where: { email } });
  }

  /**
   * Fetches a user by email for authentication purposes — the
   * result includes passwordHash and refreshTokenHash, which
   * UsersService's public methods deliberately never expose. Only
   * AuthService should call this; the explicit name signals that
   * privileged intent rather than looking like an interchangeable
   * generic finder.
   */
  findAuthUserByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({ where: { email } });
  }

  existsByEmail(email: string): Promise<boolean> {
    return this.repository.exists({ where: { email } });
  }

  findActive(): Promise<User[]> {
    return this.repository.find({ where: { status: UserStatus.ACTIVE } });
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.repository.update({ id }, { lastLogin: new Date() });
  }

  /**
   * Persists the hash of a newly issued session (registration), or
   * clears it (null) on logout/revocation. Login uses
   * replaceRefreshTokenHashOnLogin() and refresh uses the CAS below.
   *
   * Also clears previousRefreshTokenHash/refreshTokenRotatedAt and
   * displacedRefreshTokenHash/displacedAt, so a logged-out session
   * can't still be recognized as "recently rotated" or "displaced"
   * by a stale token from the old session. A new hash starts a fresh
   * session lifetime; clearing the hash clears sessionStartedAt.
   */
  async updateRefreshTokenHash(
    id: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.repository.update(
      { id },
      {
        refreshTokenHash,
        previousRefreshTokenHash: null,
        refreshTokenRotatedAt: null,
        displacedRefreshTokenHash: null,
        displacedAt: null,
        sessionStartedAt: refreshTokenHash === null ? null : new Date(),
      },
    );
  }

  /**
   * Replaces the user's refresh token hash on a fresh login, while
   * preserving the outgoing hash as displacedRefreshTokenHash (with
   * a timestamp) rather than discarding it. TrustFlow permits only
   * one active session per user — this lets a now-displaced device's
   * next refresh() attempt be recognized and given a clear reason
   * (SESSION_REPLACED_BY_NEW_LOGIN) instead of a generic "invalid
   * token" response indistinguishable from theft.
   * A successful login also starts a fresh absolute session lifetime.
   *
   * Does NOT touch previousRefreshTokenHash/refreshTokenRotatedAt —
   * those serve a separate, short-lived purpose (the rotation
   * CAS-race grace window) and are irrelevant here.
   */
  async replaceRefreshTokenHashOnLogin(
    id: string,
    newRefreshTokenHash: string,
  ): Promise<void> {
    const user = await this.findById(id);

    await this.repository.update(
      { id },
      {
        refreshTokenHash: newRefreshTokenHash,
        displacedRefreshTokenHash: user?.refreshTokenHash ?? null,
        displacedAt: user?.refreshTokenHash ? new Date() : null,
        sessionStartedAt: new Date(),
      },
    );
  }

  /**
   * Compare-and-swap rotation for refresh token reuse detection.
   * The UPDATE only matches a row whose refreshTokenHash is still
   * the hash we verified against — if a concurrent refresh() call
   * already rotated it first, zero rows match and this returns
   * false, telling the caller to discard the tokens it generated
   * rather than returning them.
   *
   * On success, the old hash is preserved as previousRefreshTokenHash
   * with a timestamp, so a losing concurrent caller can be told
   * "already rotated" instead of having its session wiped as theft.
   */
  async rotateRefreshTokenHash(
    id: string,
    verifiedHash: string,
    newHash: string,
    cutoff: Date,
  ): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(User)
      .set({
        refreshTokenHash: newHash,
        previousRefreshTokenHash: verifiedHash,
        refreshTokenRotatedAt: new Date(),
      })
      .where(
        '"id" = :id AND "refresh_token_hash" = :verifiedHash AND "session_started_at" IS NOT NULL AND "session_started_at" > :cutoff',
        { id, verifiedHash, cutoff },
      )
      .execute();

    return (result.affected ?? 0) === 1;
  }

  /**
   * Soft-deletes the user (sets deletedAt via TypeORM's soft-delete
   * support) rather than removing the row — audit history and any
   * foreign key references (e.g. OrganizationMember, AuditLog) stay
   * intact.
   */
  async softDelete(id: string): Promise<void> {
    await this.repository.softDelete({ id });
  }

  async update(id: string, data: Partial<User>): Promise<User | null> {
    await this.repository.update({ id }, data);
    return this.findById(id);
  }
}
