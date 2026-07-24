import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationMember } from './entities/organization-member.entity';
import { OrganizationMembersRepository } from './organization-members.repository';

@Module({
  imports: [TypeOrmModule.forFeature([OrganizationMember])],
  providers: [OrganizationMembersRepository],
  exports: [TypeOrmModule, OrganizationMembersRepository],
})
export class OrganizationMembersModule {}
