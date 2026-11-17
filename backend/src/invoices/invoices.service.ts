import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { InvoiceLineItem } from './entities/invoice-line-item.entity';
import { InvoiceCounter } from './entities/invoice-counter.entity';
import { InvoicesRepository } from './invoices.repository';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { decimalStringToMinorUnits } from '../common/money/decimal-minor-units';

/**
 * InvoicesService
 *
 * RATIFIED: Invoice creation is automatic on Order confirmation, not
 * a client-driven action — createInvoiceForOrder() is called from
 * OrdersService.confirmOrder(), inside confirmOrder's own
 * transaction. No controller endpoint for invoice creation exists.
 *
 * RATIFIED: Two-stage approval: DRAFT -> APPROVED -> ISSUED.
 * RATIFIED: invoiceNumber is year-prefixed, resets per (org, year).
 * RATIFIED: Overpayment allowed + flagged for review — see
 * applyPayment() below, called from PaymentsService.recordPayment()
 * inside PaymentsService's own transaction (same non-event-driven
 * reasoning as createInvoiceForOrder()).
 */
@Injectable()
export class InvoicesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly invoicesRepository: InvoicesRepository,
  ) {}

  async createInvoiceForOrder(
    order: Order,
    orderItems: OrderItem[],
    createdByUserId: string,
    manager: EntityManager,
  ): Promise<Invoice> {
    const discountMagnitude = order.discount.startsWith('-')
      ? order.discount.slice(1)
      : order.discount;
    if (decimalStringToMinorUnits(discountMagnitude) !== 0) {
      throw new ConflictException({
        message:
          'Orders with a nonzero discount cannot be invoiced until discounts are supported',
        code: 'ORDER_DISCOUNT_NOT_SUPPORTED',
      });
    }

    const existing = await manager.findOne(Invoice, {
      where: { orderId: order.id, organizationId: order.organizationId },
    });
    if (existing) {
      throw new BadRequestException(
        `Order ${order.id} already has invoice ${existing.invoiceNumber}`,
      );
    }

    if (orderItems.length === 0) {
      throw new BadRequestException(
        `Order ${order.id} has no line items to invoice`,
      );
    }

    const invoiceNumber = await this.nextInvoiceNumber(
      order.organizationId,
      manager,
    );

    let subtotal = 0;
    const lineItems: InvoiceLineItem[] = [];
    for (const item of orderItems) {
      const unitPriceKobo = decimalStringToMinorUnits(item.unitPrice);
      const lineTotalKobo = unitPriceKobo * item.quantity;
      if (!Number.isSafeInteger(lineTotalKobo)) {
        throw new BadRequestException(
          'Invoice line total exceeds the supported safe integer range',
        );
      }

      const nextSubtotal = subtotal + lineTotalKobo;
      if (!Number.isSafeInteger(nextSubtotal)) {
        throw new BadRequestException(
          'Invoice subtotal exceeds the supported safe integer range',
        );
      }
      subtotal = nextSubtotal;

      const lineItem = manager.create(InvoiceLineItem, {
        organizationId: order.organizationId,
        productId: item.productId,
        description: item.productName,
        quantity: item.quantity,
        unitPrice: unitPriceKobo,
        lineTotal: lineTotalKobo,
      });
      lineItems.push(lineItem);
    }

    const discountAmount = 0;
    const taxAmount = 0;
    const subtotalAfterDiscount = subtotal - discountAmount;
    if (!Number.isSafeInteger(subtotalAfterDiscount)) {
      throw new BadRequestException(
        'Invoice total exceeds the supported safe integer range',
      );
    }
    const total = subtotalAfterDiscount + taxAmount;
    if (!Number.isSafeInteger(total)) {
      throw new BadRequestException(
        'Invoice total exceeds the supported safe integer range',
      );
    }

    const invoice = manager.create(Invoice, {
      organizationId: order.organizationId,
      orderId: order.id,
      customerId: order.customerId,
      invoiceNumber,
      status: InvoiceStatus.DRAFT,
      issueDate: null,
      dueDate: null,
      subtotal,
      discountAmount,
      taxAmount,
      total,
      amountPaid: 0,
      amountDue: total,
      currency: 'NGN',
      notes: null,
      createdBy: createdByUserId,
    });

    const savedInvoice = await manager.save(Invoice, invoice);

    for (const lineItem of lineItems) {
      lineItem.invoiceId = savedInvoice.id;
    }
    await manager.save(InvoiceLineItem, lineItems);

    savedInvoice.lineItems = lineItems;
    return savedInvoice;
  }

  async getInvoice(id: string, organizationId: string): Promise<Invoice> {
    return this.invoicesRepository.getOwnedInvoiceOrThrow(id, organizationId);
  }

  async listInvoices(organizationId: string): Promise<Invoice[]> {
    return this.invoicesRepository.findAllForOrganization(organizationId);
  }

  async updateInvoice(
    id: string,
    dto: UpdateInvoiceDto,
    organizationId: string,
  ): Promise<Invoice> {
    const invoice = await this.invoicesRepository.getOwnedInvoiceOrThrow(
      id,
      organizationId,
    );

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `Invoice ${id} cannot be edited once approved or later (status: ${invoice.status})`,
      );
    }

    if (dto.dueDate !== undefined) {
      invoice.dueDate = new Date(dto.dueDate);
    }
    if (dto.notes !== undefined) {
      invoice.notes = dto.notes;
    }

    return this.dataSource.getRepository(Invoice).save(invoice);
  }

  async approveInvoice(id: string, organizationId: string): Promise<Invoice> {
    const invoice = await this.invoicesRepository.getOwnedInvoiceOrThrow(
      id,
      organizationId,
    );

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `Only a DRAFT invoice can be approved (current status: ${invoice.status})`,
      );
    }

    invoice.status = InvoiceStatus.APPROVED;
    return this.dataSource.getRepository(Invoice).save(invoice);
  }

  async issueInvoice(id: string, organizationId: string): Promise<Invoice> {
    const invoice = await this.invoicesRepository.getOwnedInvoiceOrThrow(
      id,
      organizationId,
    );

    if (invoice.status !== InvoiceStatus.APPROVED) {
      throw new BadRequestException(
        `Only an APPROVED invoice can be issued (current status: ${invoice.status})`,
      );
    }

    invoice.status = InvoiceStatus.ISSUED;
    invoice.issueDate = new Date();
    return this.dataSource.getRepository(Invoice).save(invoice);
  }

  /**
   * RATIFIED: called from PaymentsService.recordPayment(), inside
   * PaymentsService's own transaction — not opened here. Applies a
   * SUCCESSFUL payment's amount to amountPaid/amountDue, advances
   * status to PARTIALLY_PAID or PAID, and sets flaggedForReview when
   * the payment overpays the invoice (RATIFIED: allow the payment,
   * flag for manual review — not blocked, not silently clamped).
   *
   * `invoice` must be the transaction-locked instance (fetched via
   * manager in PaymentsService, not this.invoicesRepository) so
   * PaymentsService and InvoicesService never race on the same row.
   */
  async applyPayment(
    invoice: Invoice,
    paymentAmountKobo: number,
    manager: EntityManager,
  ): Promise<Invoice> {
    const amountPaid = invoice.amountPaid + paymentAmountKobo;
    if (
      !Number.isSafeInteger(paymentAmountKobo) ||
      !Number.isSafeInteger(amountPaid)
    ) {
      throw new BadRequestException(
        'Payment would exceed the supported safe integer range',
      );
    }
    const amountDue = invoice.total - amountPaid;
    if (!Number.isSafeInteger(amountDue)) {
      throw new BadRequestException(
        'Invoice amount due exceeds the supported safe integer range',
      );
    }
    invoice.amountPaid = amountPaid;
    invoice.amountDue = amountDue;

    if (invoice.amountPaid > invoice.total) {
      invoice.flaggedForReview = true;
    }

    if (invoice.amountPaid >= invoice.total) {
      invoice.status = InvoiceStatus.PAID;
    } else if (invoice.amountPaid > 0) {
      invoice.status = InvoiceStatus.PARTIALLY_PAID;
    }

    return manager.save(Invoice, invoice);
  }

  private async nextInvoiceNumber(
    organizationId: string,
    manager: EntityManager,
  ): Promise<string> {
    const year = new Date().getFullYear();

    await manager.query(
      `INSERT INTO invoice_counters (id, organization_id, year, last_number, created_at, updated_at)
       VALUES (uuid_generate_v4(), $1, $2, 0, now(), now())
       ON CONFLICT (organization_id, year) DO NOTHING`,
      [organizationId, year],
    );

    const counter = await manager
      .createQueryBuilder(InvoiceCounter, 'c')
      .setLock('pessimistic_write')
      .where('c.organizationId = :organizationId', { organizationId })
      .andWhere('c.year = :year', { year })
      .getOne();

    if (!counter) {
      throw new NotFoundException(
        `InvoiceCounter for organization ${organizationId}, year ${year} could not be locked`,
      );
    }

    counter.lastNumber += 1;
    await manager.save(InvoiceCounter, counter);

    return `INV-${year}-${String(counter.lastNumber).padStart(6, '0')}`;
  }
}
