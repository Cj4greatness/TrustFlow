import {
  Body,
  Controller,
  Get,
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
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PermissionsGuard } from '../authorization/guards/permissions.guard';
import { Permissions } from '../authorization/decorators/permissions.decorator';
import { Permission } from '../authorization/permissions.enum';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/**
 * PaymentsController
 *
 * Nested under an invoice, matching OrderItemsController's pattern
 * under Orders — invoiceId comes only from the route, never from the
 * request body (see CreatePaymentDto's doc comment).
 *
 * RATIFIED: no status guard on which invoice states can receive a
 * payment — DRAFT through PAID are all valid (deposits before
 * issuance, and overpayment on an already-PAID invoice, are both
 * real, allowed cases). That check does not belong here or in the
 * service; don't reintroduce it without a new ratified decision.
 */
@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('organizations/:id/invoices/:invoiceId/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @Permissions(Permission.PAYMENT_CREATE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Record a manually-confirmed payment against an invoice',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'invoiceId', description: 'Invoice UUID' })
  create(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: CreatePaymentDto,
    @Req() req: RequestWithUser,
  ) {
    return this.paymentsService.recordPayment(
      invoiceId,
      dto,
      organizationId,
      req.user.id,
    );
  }

  @Get()
  @Permissions(Permission.PAYMENT_READ)
  @ApiOperation({ summary: 'List payments recorded against an invoice' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'invoiceId', description: 'Invoice UUID' })
  findAll(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
  ) {
    return this.paymentsService.listPaymentsForInvoice(
      invoiceId,
      organizationId,
    );
  }

  @Get(':paymentId')
  @Permissions(Permission.PAYMENT_READ)
  @ApiOperation({ summary: 'Get a single payment' })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiParam({ name: 'invoiceId', description: 'Invoice UUID' })
  @ApiParam({ name: 'paymentId', description: 'Payment UUID' })
  findOne(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.paymentsService.getPayment(paymentId, organizationId);
  }
}
