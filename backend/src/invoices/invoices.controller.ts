import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { InvoicesService } from './invoices.service';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permissions.enum';

/**
 * InvoicesController
 *
 * RATIFIED: Invoice creation is automatic on Order confirmation
 * (OrdersService, not here) — the manual POST .../invoices endpoint
 * that used to live here has been removed entirely, not kept as an
 * override. If a re-invoicing / edge-case creation path is ever
 * needed again, that's a new decision, not a revival of this one.
 *
 * Two-stage approval: POST .../approve (DRAFT -> APPROVED) must run
 * before POST .../issue (APPROVED -> ISSUED) — enforced in
 * InvoicesService, not here.
 */
@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('organizations/:id/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @Permissions(Permission.INVOICE_READ)
  @ApiOperation({ summary: 'List invoices in an organization' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  findAll(@Param('id', ParseUUIDPipe) organizationId: string) {
    return this.invoicesService.listInvoices(organizationId);
  }

  @Get(':invoiceId')
  @Permissions(Permission.INVOICE_READ)
  @ApiOperation({ summary: 'Get a single invoice' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'invoiceId', description: 'Invoice UUID' })
  findOne(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ) {
    return this.invoicesService.getInvoice(invoiceId, organizationId);
  }

  @Patch(':invoiceId')
  @Permissions(Permission.INVOICE_UPDATE)
  @ApiOperation({ summary: 'Update a DRAFT invoice (notes/dueDate only)' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'invoiceId', description: 'Invoice UUID' })
  update(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.updateInvoice(invoiceId, dto, organizationId);
  }

  @Post(':invoiceId/approve')
  @Permissions(Permission.INVOICE_APPROVE)
  @ApiOperation({ summary: 'Internally approve a DRAFT invoice' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'invoiceId', description: 'Invoice UUID' })
  approve(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ) {
    return this.invoicesService.approveInvoice(invoiceId, organizationId);
  }

  @Post(':invoiceId/issue')
  @Permissions(Permission.INVOICE_ISSUE)
  @ApiOperation({ summary: 'Issue an APPROVED invoice to the customer' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'invoiceId', description: 'Invoice UUID' })
  issue(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ) {
    return this.invoicesService.issueInvoice(invoiceId, organizationId);
  }
}
