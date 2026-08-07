import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationMember } from './entities/organization-member.entity';
import { Invitation } from './entities/invitation.entity';
import { OrganizationMembersRepository } from './organization-members.repository';
import { InvitationsRepository } from './invitations.repository';
import { InvitationsService } from './invitations.service';
import { InvitationsController } from './invitations.controller';
import { OrganizationMembersService } from './organization-members.service';
import { OrganizationMembersController } from './organization-members.controller';
import { EmailModule } from '../email/email.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationMember, Invitation]),
    EmailModule,
    forwardRef(() => OrganizationsModule),
    UsersModule,
    forwardRef(() => AuthorizationModule),
  ],
  controllers: [InvitationsController, OrganizationMembersController],
  providers: [
    OrganizationMembersRepository,
    InvitationsRepository,
    InvitationsService,
    OrganizationMembersService,
  ],
  exports: [
    TypeOrmModule,
    OrganizationMembersRepository,
    InvitationsRepository,
  ],
})
export class OrganizationMembersModule {}
