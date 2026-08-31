import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ReceiptsService } from './receipts.service';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permissions.enum';

/**
 * ReceiptsController
 *
 * §4: no POST create endpoint — a Receipt must never be manufacturable
 * independent of a real successful Payment. Creation happens only via
 * ReceiptsService's payment.succeeded listener. GET/list/void only.
 */
@ApiTags('receipts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('organizations/:id/receipts')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get()
  @Permissions(Permission.RECEIPT_READ)
  @ApiOperation({ summary: 'List receipts in an organization' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  findAll(@Param('id', ParseUUIDPipe) organizationId: string) {
    return this.receiptsService.listReceipts(organizationId);
  }

  @Get(':receiptId')
  @Permissions(Permission.RECEIPT_READ)
  @ApiOperation({ summary: 'Get a single receipt' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'receiptId', description: 'Receipt UUID' })
  findOne(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
  ) {
    return this.receiptsService.getReceipt(receiptId, organizationId);
  }

  @Post(':receiptId/void')
  @Permissions(Permission.RECEIPT_VOID)
  @ApiOperation({ summary: 'Void an ISSUED receipt' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'receiptId', description: 'Receipt UUID' })
  void(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
  ) {
    return this.receiptsService.voidReceipt(receiptId, organizationId);
  }
}
