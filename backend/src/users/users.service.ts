import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User, UserStatus } from './entities/user.entity';
import { OrganizationMembersRepository } from '../organization-members/organization-members.repository';
import { OrganizationRole } from '../organization-members/entities/organization-member.entity';

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly usersRepository: UsersRepository,
    private readonly organizationMembersRepository: OrganizationMembersRepository,
  ) {}

  /**
   * Creates a user record directly. Note: this does NOT hash the
   * password — the caller (AuthModule, in a future phase) is
   * responsible for hashing via PasswordService before calling this.
   * Keeping hashing out of UsersService means this module has no
   * dependency on the security/crypto layer, and Auth stays the only
   * place that ever handles a raw password.
   */
  async create(
    dto: CreateUserDto,
    passwordHash: string,
  ): Promise<UserResponseDto> {
    const emailTaken = await this.usersRepository.existsByEmail(dto.email);
    if (emailTaken) {
      throw new ConflictException('An account with this email already exists');
    }

    const user = this.usersRepository.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone ?? null,
      passwordHash,
    });

    const saved = await this.usersRepository.save(user);
    return this.toResponseDto(saved);
  }

  async findById(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toResponseDto(user);
  }

  /**
   * Returns the raw entity (including passwordHash) rather than the
   * response DTO — intended for internal use only (e.g. AuthModule's
   * login flow needs the hash to verify a password). Never expose
   * this method's result directly through a controller response.
   */
  findByEmailInternal(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const existing = await this.usersRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.usersRepository.update(id, {
      ...(dto.firstName !== undefined && { firstName: dto.firstName }),
      ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.avatar !== undefined && { avatar: dto.avatar }),
    });

    // Unreachable in practice (we just confirmed existence above),
    // but keeps the return type honest rather than asserting non-null.
    if (!updated) {
      throw new NotFoundException('User not found');
    }

    return this.toResponseDto(updated);
  }

  async softDelete(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const user = await this.usersRepository.findByIdForUpdate(id, manager);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const memberRepo =
        this.organizationMembersRepository.withTransaction(manager);
      const memberships = await memberRepo.findByUser(id);
      const organizationIds = [
        ...new Set(memberships.map((membership) => membership.organizationId)),
      ].sort();

      for (const organizationId of organizationIds) {
        await memberRepo.lockOrganization(organizationId);
      }

      const currentMemberships = await memberRepo.findByUser(id);
      if (user.status === UserStatus.ACTIVE) {
        for (const membership of currentMemberships) {
          if (membership.role !== OrganizationRole.OWNER) {
            continue;
          }

          const activeOwners = await memberRepo.findActiveOwners(
            membership.organizationId,
          );
          if (!activeOwners.some((owner) => owner.userId !== id)) {
            throw new BadRequestException({
              message: 'Transfer ownership first',
              code: 'LAST_OWNER_CANNOT_BE_REMOVED',
            });
          }
        }
      }

      await this.usersRepository.updateRefreshTokenHash(id, null, manager);
      await memberRepo.softDeleteByUser(id);
      await this.usersRepository.softDelete(id, manager);
    });
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.usersRepository.updateLastLogin(id);
  }

  private toResponseDto(user: User): UserResponseDto {
    return new UserResponseDto({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      status: user.status,
      emailVerified: user.emailVerified,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
    });
  }
}
