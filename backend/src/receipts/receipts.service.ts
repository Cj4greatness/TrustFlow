import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { Receipt, ReceiptStatus } from './entities/receipt.entity';
import { ReceiptCounter } from './entities/receipt-counter.entity';
import { ReceiptsRepository } from './receipts.repository';
import { ReceiptSettingsService } from '../receipt-settings/receipt-settings.service';
import { Payment } from '../payments/entities/payment.entity';
import { Invoice } from '../invoices/entities/invoice.entity';

const POSTGRES_UNIQUE_VIOLATION = '23505';

interface PaymentSucceededEvent {
  paymentId: string;
  invoiceId: string;
  organizationId: string;
  amount: number;
}

/**
 * ReceiptsService
 *
 * TRIGGER (§20, ratified this session): handlePaymentSucceeded() is
 * an EventEmitter2 listener on `payment.succeeded` — NOT called
 * synchronously from PaymentsService. See Receipt entity's class doc
 * for the full reasoning on why this deliberately diverges from the
 * Order->Invoice / Payment->Invoice synchronous precedent.
 *
 * IDEMPOTENCY (§20): findByPaymentId() check before insert, plus a
 * unique-violation catch-and-refetch fallback for the race window —
 * same two-layer pattern as PaymentsService's idempotency-key
 * handling, just keyed on paymentId instead of a client-supplied key
 * (there is no client action here to attach a key to).
 *
 * NO CREATE ENDPOINT (§4): receipts are never created via a
 * controller action — only this listener creates them.
 */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly receiptsRepository: ReceiptsRepository,
    private readonly receiptSettingsService: ReceiptSettingsService,
  ) {}

  @OnEvent('payment.succeeded')
  async handlePaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
    try {
      await this.createReceiptForPayment(event.paymentId, event.organizationId);
    } catch (err) {
      // A listener throwing does not roll back the Payment
      // transaction that already committed — that transaction is
      // long finished by the time this runs. Logging, not
      // rethrowing: per the Receipt entity's class doc, a failed
      // receipt creation is a recoverable gap (future admin
      // "regenerate receipt" action), not a corrupted ledger. This
      // is the concrete cost of choosing event-driven over
      // synchronous — flagged here so it isn't a silent swallow.
      this.logger.error(
        `Failed to create receipt for payment ${event.paymentId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async createReceiptForPayment(
    paymentId: string,
    organizationId: string,
  ): Promise<Receipt> {
    const existing = await this.receiptsRepository.findByPaymentId(
      paymentId,
      organizationId,
    );
    if (existing) {
      return existing;
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const payment = await manager.findOne(Payment, {
          where: { id: paymentId, organizationId },
        });
        if (!payment) {
          throw new NotFoundException(
            `Payment ${paymentId} not found — cannot generate receipt`,
          );
        }

        const invoice = await manager.findOne(Invoice, {
          where: { id: payment.invoiceId, organizationId },
        });
        if (!invoice) {
          throw new NotFoundException(
            `Invoice ${payment.invoiceId} not found — cannot generate receipt for payment ${paymentId}`,
          );
        }

        const settings =
          await this.receiptSettingsService.getSettings(organizationId);

        const receiptNumber = await this.nextReceiptNumber(
          organizationId,
          manager,
        );

        const receipt = manager.create(Receipt, {
          organizationId,
          paymentId: payment.id,
          orderId: invoice.orderId ?? null,
          invoiceId: invoice.id,
          customerId: invoice.customerId ?? null,
          receiptNumber,
          amount: payment.amount,
          currency: payment.currency,
          paymentDate: payment.confirmedAt ?? new Date(),
          displayNameSnapshot: settings.displayName,
          accentColorSnapshot: settings.accentColor,
          status: ReceiptStatus.ISSUED,
          issuedAt: new Date(),
        });

        return manager.save(Receipt, receipt);
      });
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as unknown as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
      ) {
        const raceWinner = await this.receiptsRepository.findByPaymentId(
          paymentId,
          organizationId,
        );
        if (raceWinner) {
          return raceWinner;
        }
      }
      throw err;
    }
  }

  async getReceipt(id: string, organizationId: string): Promise<Receipt> {
    return this.receiptsRepository.getOwnedReceiptOrThrow(id, organizationId);
  }

  async listReceipts(organizationId: string): Promise<Receipt[]> {
    return this.receiptsRepository.findAllForOrganization(organizationId);
  }

  /**
   * §5: the only transition Receipt v1 supports. ISSUED -> VOIDED
   * only — no other states exist to transition through or from.
   */
  async voidReceipt(id: string, organizationId: string): Promise<Receipt> {
    const receipt = await this.receiptsRepository.getOwnedReceiptOrThrow(
      id,
      organizationId,
    );

    if (receipt.status !== ReceiptStatus.ISSUED) {
      throw new BadRequestException(
        `Only an ISSUED receipt can be voided (current status: ${receipt.status})`,
      );
    }

    receipt.status = ReceiptStatus.VOIDED;
    return this.dataSource.getRepository(Receipt).save(receipt);
  }

  private async nextReceiptNumber(
    organizationId: string,
    manager: EntityManager,
  ): Promise<string> {
    await manager.query(
      `INSERT INTO receipt_counters (id, organization_id, last_number, created_at, updated_at)
       VALUES (uuid_generate_v4(), $1, 0, now(), now())
       ON CONFLICT (organization_id) DO NOTHING`,
      [organizationId],
    );

    const counter = await manager
      .createQueryBuilder(ReceiptCounter, 'c')
      .setLock('pessimistic_write')
      .where('c.organizationId = :organizationId', { organizationId })
      .getOne();

    if (!counter) {
      throw new NotFoundException(
        `ReceiptCounter for organization ${organizationId} could not be locked`,
      );
    }

    counter.lastNumber += 1;
    await manager.save(ReceiptCounter, counter);

    return `TF-${String(counter.lastNumber).padStart(6, '0')}`;
  }
}
