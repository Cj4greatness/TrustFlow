import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationMember } from './entities/organization-member.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrganizationMember])],
  exports: [TypeOrmModule],
})
export class OrganizationMembersModule {}
