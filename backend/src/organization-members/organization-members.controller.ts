import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { OrganizationMembersService } from './organization-members.service';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permissions.enum';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags('organizations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('organizations/:id/members')
export class OrganizationMembersController {
  constructor(
    private readonly organizationMembersService: OrganizationMembersService,
  ) {}

  @Get()
  @Permissions(Permission.MEMBER_VIEW)
  @ApiOperation({ summary: 'List members of an organization' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  listMembers(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.organizationMembersService.listMembers(
      organizationId,
      req.user.id,
    );
  }

  @Patch(':memberId')
  @Permissions(Permission.MEMBER_UPDATE)
  @ApiOperation({ summary: "Update a member's role" })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'memberId', description: 'Membership UUID' })
  async updateRole(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberRoleDto,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    await this.organizationMembersService.updateMemberRole(
      organizationId,
      memberId,
      dto.role,
      req.user.id,
    );
  }

  @Delete(':memberId')
  @Permissions(Permission.MEMBER_REMOVE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from the organization' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'memberId', description: 'Membership UUID' })
  async removeMember(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    await this.organizationMembersService.removeMember(
      organizationId,
      memberId,
      req.user.id,
    );
  }

  @Post('transfer-ownership')
  @Permissions(Permission.OWNERSHIP_TRANSFER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Transfer organization ownership to another member',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  async transferOwnership(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: TransferOwnershipDto,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    await this.organizationMembersService.transferOwnership(
      organizationId,
      dto.newOwnerMemberId,
      req.user.id,
    );
  }

  @Post('leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Leave an organization' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  async leave(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    await this.organizationMembersService.leaveOrganization(
      organizationId,
      req.user.id,
    );
  }
}
