import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

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
    const existing = await this.usersRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    await this.usersRepository.softDelete(id);
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
