import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ReceiptSettingsService } from './receipt-settings.service';
import { UpdateReceiptSettingsDto } from './dto/update-receipt-settings.dto';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permissions.enum';

/**
 * ReceiptSettingsController
 *
 * Sprint 6 CTO Directive §13: organizations/:organizationId/receipt-settings,
 * GET + PATCH only — no create/delete endpoint. getSettings() always
 * returns a usable row (creating a default-backed one on first read),
 * so there's no "not found" state to create around.
 */
@ApiTags('receipt-settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('organizations/:id/receipt-settings')
export class ReceiptSettingsController {
  constructor(
    private readonly receiptSettingsService: ReceiptSettingsService,
  ) {}

  @Get()
  @Permissions(Permission.RECEIPT_SETTINGS_READ)
  @ApiOperation({
    summary: 'Get receipt branding settings (defaults applied if unset)',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  getSettings(@Param('id', ParseUUIDPipe) organizationId: string) {
    return this.receiptSettingsService.getSettings(organizationId);
  }

  @Patch()
  @Permissions(Permission.RECEIPT_SETTINGS_UPDATE)
  @ApiOperation({
    summary: 'Update receipt branding settings (displayName/accentColor)',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  updateSettings(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: UpdateReceiptSettingsDto,
  ) {
    return this.receiptSettingsService.updateSettings(organizationId, dto);
  }
}
