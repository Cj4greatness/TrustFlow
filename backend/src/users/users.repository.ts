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
   * Persists the hash of the user's current valid refresh token, or
   * clears it (null) on logout/revocation. Called after every
   * successful login/register/refresh, and on logout.
   */
  async updateRefreshTokenHash(
    id: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.repository.update({ id }, { refreshTokenHash });
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
