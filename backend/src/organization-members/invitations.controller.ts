import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags('organizations')
@Controller('organizations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post(':id/invitations')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite a user to join an organization' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiResponse({
    status: 201,
    description: 'Invitation created and dispatched',
  })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  @ApiResponse({
    status: 409,
    description: 'A pending invitation already exists',
  })
  invite(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateInvitationDto,
    @Req() req: RequestWithUser,
  ) {
    return this.invitationsService.invite(
      organizationId,
      dto.email,
      dto.role,
      req.user.id,
    );
  }

  @Post('invitations/:token/accept')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Accept an invitation, joining the organization' })
  @ApiParam({ name: 'token', description: 'Invitation token' })
  @ApiResponse({
    status: 204,
    description: 'Invitation accepted, membership created',
  })
  @ApiResponse({
    status: 400,
    description: 'Invitation expired, already used, or revoked',
  })
  @ApiResponse({
    status: 409,
    description: 'Already a member of this organization',
  })
  async accept(
    @Param('token') token: string,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    await this.invitationsService.accept(token, req.user.id);
  }

  @Post('invitations/:token/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reject an invitation' })
  @ApiParam({ name: 'token', description: 'Invitation token' })
  @ApiResponse({ status: 204, description: 'Invitation rejected' })
  async reject(@Param('token') token: string): Promise<void> {
    await this.invitationsService.reject(token);
  }

  @Delete('invitations/:invitationId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  @ApiParam({ name: 'invitationId', description: 'Invitation UUID' })
  @ApiResponse({ status: 204, description: 'Invitation revoked' })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  async revoke(
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    await this.invitationsService.revoke(invitationId);
  }
}
