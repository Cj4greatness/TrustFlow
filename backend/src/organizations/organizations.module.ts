import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationsRepository } from './organizations.repository';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { CommonServicesModule } from '../common/services/common-services.module';
import { OrganizationMembersModule } from '../organization-members/organization-members.module';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization]),
    CommonServicesModule,
    forwardRef(() => OrganizationMembersModule),
    forwardRef(() => AuthorizationModule),
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsRepository, OrganizationsService],
  exports: [TypeOrmModule, OrganizationsRepository, OrganizationsService],
})
export class OrganizationsModule {}
