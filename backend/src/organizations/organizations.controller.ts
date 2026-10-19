import {
  Body,
  Controller,
  Get,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationResponseDto } from './dto/organization-response.dto';
import { MyMembershipResponseDto } from './dto/my-membership-response.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permissions.enum';
import { AuthorizationService } from '../authorization/authorization.service';
import { CurrentMember } from '../authorization/decorators/current-member.decorator';
import type { OrganizationMember } from '../organization-members/entities/organization-member.entity';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags('organizations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new organization (creator becomes Owner)',
  })
  @ApiResponse({ status: 201, type: OrganizationResponseDto })
  create(
    @Body() dto: CreateOrganizationDto,
    @Req() req: RequestWithUser,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.createWithOwner(dto, req.user.id);
  }

  @Get('me')
  @ApiOperation({ summary: 'List organizations the current user belongs to' })
  @ApiResponse({ status: 200, type: [OrganizationResponseDto] })
  findMine(@Req() req: RequestWithUser): Promise<OrganizationResponseDto[]> {
    return this.organizationsService.findMine(req.user.id);
  }

  /**
   * CTO directive D5: an org-scoped way for the frontend to learn the
   * caller's role and permissions. The org id comes from the path and
   * is verified against the caller's real membership by
   * PermissionsGuard — a client-supplied org id never establishes
   * permission by itself. ORGANIZATION_VIEW is held by every role, so
   * any member can call this; non-members get 403.
   */
  @Get(':id/me')
  @Permissions(Permission.ORGANIZATION_VIEW)
  @ApiOperation({
    summary: "The caller's role and permissions in this organization",
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiResponse({ status: 200, type: MyMembershipResponseDto })
  @ApiResponse({
    status: 403,
    description: 'Not a member of this organization',
  })
  getMyMembership(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @CurrentMember() member: OrganizationMember,
  ): MyMembershipResponseDto {
    return {
      organizationId,
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      permissions: this.authorizationService.permissionsFor(member.role),
    };
  }

  @Patch(':id')
  @Permissions(Permission.ORGANIZATION_UPDATE)
  @ApiOperation({ summary: 'Update an organization' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiResponse({ status: 200, type: OrganizationResponseDto })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.update(id, dto);
  }
}
