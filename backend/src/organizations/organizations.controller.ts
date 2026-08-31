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
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags('organizations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

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

  @Patch(':id')
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
