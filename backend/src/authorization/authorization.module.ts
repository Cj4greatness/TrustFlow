import { Module, forwardRef } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { OrganizationMembersModule } from '../organization-members/organization-members.module';

@Module({
  imports: [forwardRef(() => OrganizationMembersModule)],
  providers: [AuthorizationService, PermissionsGuard],
  exports: [AuthorizationService, PermissionsGuard],
})
export class AuthorizationModule {}
