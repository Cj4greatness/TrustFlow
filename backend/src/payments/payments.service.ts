import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Payment,
  PaymentMethod,
  PaymentStatus,
} from './entities/payment.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { PaymentsRepository } from './payments.repository';
import { InvoicesService } from '../invoices/invoices.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * PaymentsService
 *
 * RATIFIED: v1 has exactly one provider (manual confirmation) —
 * recordPayment() both creates the Payment AND resolves it to
 * SUCCESS in the same call.
 *
 * RATIFIED: payments can be recorded against an invoice in ANY
 * status — DRAFT, APPROVED, ISSUED, PARTIALLY_PAID, or PAID.
 * Deliberately no status guard here.
 *
 * RATIFIED (idempotency): idempotencyKey is required and
 * client-supplied. recordPayment() checks for an existing Payment
 * with the same (organizationId, idempotencyKey) BEFORE inserting —
 * if found, returns that original Payment unchanged (does not
 * re-apply it to the Invoice, does not re-emit the event). This is a
 * deliberate retry-safety contract: the caller resending the same
 * key (network retry, accidental double-click) gets the original
 * result, not an error and not a duplicate financial record.
 *
 * The fast-path check has a race window (two simultaneous requests
 * with the same key could both pass the check before either inserts)
 * — the DB's unique constraint on (organizationId, idempotencyKey)
 * is the actual guarantee. If the insert fails with Postgres unique-
 * violation (23505), we re-fetch and return the row the other
 * request inserted, rather than surfacing a 500.
 *
 * Invoice consistency is NOT event-driven: Payment insert +
 * Invoice.applyPayment() run in one transaction, with Invoice
 * pessimistic-locked via manager. `payment.succeeded` fires only
 * AFTER the transaction commits, for Communication Hub (no listener
 * exists yet).
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly paymentsRepository: PaymentsRepository,
    private readonly invoicesService: InvoicesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async recordPayment(
    invoiceId: string,
    dto: CreatePaymentDto,
    organizationId: string,
    userId: string,
  ): Promise<Payment> {
    const existing = await this.dataSource.getRepository(Payment).findOne({
      where: { organizationId, idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      return existing;
    }

    let result: Payment;
    try {
      result = await this.dataSource.transaction(async (manager) => {
        const invoice = await manager
          .createQueryBuilder(Invoice, 'invoice')
          .setLock('pessimistic_write')
          .where('invoice.id = :id', { id: invoiceId })
          .andWhere('invoice.organizationId = :organizationId', {
            organizationId,
          })
          .getOne();

        if (!invoice) {
          throw new NotFoundException(`Invoice ${invoiceId} not found`);
        }

        const payment = manager.create(Payment, {
          organizationId,
          invoiceId: invoice.id,
          idempotencyKey: dto.idempotencyKey,
          amount: dto.amount,
          currency: invoice.currency,
          method: PaymentMethod.MANUAL,
          providerReference: dto.providerReference ?? null,
          status: PaymentStatus.SUCCESS,
          confirmedBy: userId,
          confirmedAt: new Date(),
          createdBy: userId,
        });
        const savedPayment = await manager.save(Payment, payment);

        await this.invoicesService.applyPayment(invoice, dto.amount, manager);

        return savedPayment;
      });
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as unknown as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
      ) {
        const raceWinner = await this.dataSource
          .getRepository(Payment)
          .findOne({
            where: { organizationId, idempotencyKey: dto.idempotencyKey },
          });
        if (raceWinner) {
          return raceWinner;
        }
      }
      throw err;
    }

    this.eventEmitter.emit('payment.succeeded', {
      paymentId: result.id,
      invoiceId: result.invoiceId,
      organizationId: result.organizationId,
      amount: result.amount,
    });

    return result;
  }

  async getPayment(id: string, organizationId: string): Promise<Payment> {
    return this.paymentsRepository.getOwnedPaymentOrThrow(id, organizationId);
  }

  async listPaymentsForInvoice(
    invoiceId: string,
    organizationId: string,
  ): Promise<Payment[]> {
    return this.paymentsRepository.findAllForInvoice(invoiceId, organizationId);
  }
}
