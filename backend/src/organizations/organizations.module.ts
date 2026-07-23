import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Organization])],
  exports: [TypeOrmModule],
})
export class OrganizationsModule {}
