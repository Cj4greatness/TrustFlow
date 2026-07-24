import { Column, Entity, Index } from 'typeorm';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';

export enum UserStatus {
  ACTIVE = 'active',
  INVITED = 'invited',
  SUSPENDED = 'suspended',
  DEACTIVATED = 'deactivated',
}

/**
 * User
 *
 * Represents a person who can authenticate with TrustFlow. A user's
 * relationship to organizations is many-to-many via OrganizationMember
 * (see Module 4), not a direct foreign key here — a user may belong
 * to multiple organizations, so organization membership is never
 * modeled directly on this entity.
 *
 * passwordHash and refreshTokenHash are both excluded from all
 * serialized responses via class-transformer's @Exclude, enforced
 * globally by the ClassSerializerInterceptor set up in main.ts.
 */
@Entity('users')
@Index(['email'], { unique: true })
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 100, name: 'first_name' })
  firstName: string;

  @Column({ type: 'varchar', length: 100, name: 'last_name' })
  lastName: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Exclude({ toPlainOnly: true })
  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatar: string | null;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ type: 'boolean', default: false, name: 'email_verified' })
  emailVerified: boolean;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_login' })
  lastLogin: Date | null;

  /**
   * Hash of the current valid refresh token, enabling rotation
   * (each successful refresh replaces this with a new hash) and
   * revocation (logout / suspected theft sets this to null,
   * invalidating the refresh token immediately even though the JWT
   * itself hasn't expired yet). Never returned via the API.
   */
  @Exclude({ toPlainOnly: true })
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'refresh_token_hash',
  })
  refreshTokenHash: string | null;
}
