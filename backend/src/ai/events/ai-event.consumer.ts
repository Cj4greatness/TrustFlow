import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

interface PaymentSucceededEvent {
  paymentId: string;
  invoiceId: string;
  organizationId: string;
  amount: string;
}

/**
 * AiEventConsumer
 *
 * S7-01 §9. Establishes the AI integration boundary for existing
 * domain events, using the same in-process EventEmitter2 mechanism
 * ReceiptsService already relies on for 'payment.succeeded' — no new
 * event bus, no changes to any emitter (existing events remain the
 * source of truth per directive §8).
 *
 * Locked decision: no queue is introduced. Sprint 7 scope is the
 * listener/boundary only — logging that the event was observed, not
 * any insight-generation or context-pipeline logic, since no
 * consuming feature exists yet.
 */
@Injectable()
export class AiEventConsumer {
  private readonly logger = new Logger(AiEventConsumer.name);

  @OnEvent('payment.succeeded')
  handlePaymentSucceeded(event: PaymentSucceededEvent): void {
    this.logger.debug(
      `AI event boundary observed payment.succeeded (paymentId=${event.paymentId}, ` +
        `organizationId=${event.organizationId}) — no consuming AI feature yet.`,
    );
  }
}
