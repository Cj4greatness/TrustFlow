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
  Req,
  UseGuards,
  ForbiddenException,
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
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/**
 * SECURITY FIX (found while documenting the API for the frontend,
 * Sprint 8 follow-up): this controller previously had NO guard at
 * all, so GET/PATCH/DELETE /users/:id worked for anonymous callers
 * against any user id. Now every route requires a valid access token
 * AND is restricted to the caller's own record.
 *
 * Self-only is the conservative default. Whether an org Owner/Admin
 * should be able to view other members' profiles is a product/RBAC
 * question for the CTO — members are already listed through
 * GET /organizations/:id/members, so nothing here is needed for that.
 */
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private assertSelf(req: RequestWithUser, targetUserId: string): void {
    if (req.user.id !== targetUserId) {
      throw new ForbiddenException('You can only access your own user record');
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({ status: 403, description: 'Not your user record' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestWithUser,
  ): Promise<UserResponseDto> {
    this.assertSelf(req, id);
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: "Update a user's profile" })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({ status: 403, description: 'Not your user record' })
  @ApiResponse({ status: 404, description: 'User not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: RequestWithUser,
  ): Promise<UserResponseDto> {
    this.assertSelf(req, id);
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a user' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 204, description: 'User soft-deleted' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({ status: 403, description: 'Not your user record' })
  @ApiResponse({ status: 404, description: 'User not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestWithUser,
  ): Promise<void> {
    this.assertSelf(req, id);
    return this.usersService.softDelete(id);
  }
}
