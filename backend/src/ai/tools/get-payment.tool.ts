import { PaymentsService } from '../../payments/payments.service';
import { Permission } from '../../authorization/permissions.enum';
import { AiTool, AiExecutionContext } from './ai-tool.interface';

export interface GetPaymentInput {
  paymentId: string;
}

export interface GetPaymentOutput {
  id: string;
  invoiceId: string;
  amount: number;
  currency: string;
  method: string;
  providerReference: string | null;
  status: string;
  confirmedAt: Date | null;
}

/**
 * get_payment
 *
 * Seventh (final, for this batch) Tool Registry entry, mirroring
 * get_customer/get_order's shape: read-only, org-scoped via
 * PaymentsRepository.getOwnedPaymentOrThrow (called internally by
 * getPayment()) — no new tenant-isolation logic introduced.
 *
 * NOTE: PaymentsService.getPayment() takes (id, organizationId) —
 * the REVERSE argument order from get_order/get_supplier/get_product's
 * (organizationId, id). Same reversed pattern as get_invoice and
 * get_delivery — Invoice/Payment/Delivery services consistently use
 * (id, organizationId), while Order/Supplier/Product use
 * (organizationId, id). Preserved exactly as each service defines
 * it, not normalized.
 *
 * amount is returned as stored on the Payment entity — same raw-
 * value-passthrough reasoning as get_invoice's kobo fields; no unit
 * conversion performed here.
 *
 * Output omits organizationId (redundant), idempotencyKey (internal
 * retry-safety mechanism, not business-relevant), and
 * confirmedBy/createdBy (internal bookkeeping, no obvious AI-facing
 * use per prior tools' reasoning).
 */
export function createGetPaymentTool(
  paymentsService: PaymentsService,
): AiTool<GetPaymentInput, GetPaymentOutput> {
  return {
    name: 'get_payment',
    description:
      "Fetch a single payment's details by ID, scoped to the caller's organization.",
    inputSchema: {
      type: 'object',
      properties: {
        paymentId: { type: 'string', format: 'uuid' },
      },
      required: ['paymentId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        invoiceId: { type: 'string' },
        amount: { type: 'number' },
        currency: { type: 'string' },
        method: { type: 'string' },
        providerReference: { type: ['string', 'null'] },
        status: { type: 'string' },
        confirmedAt: { type: ['string', 'null'], format: 'date-time' },
      },
    },
    requiredPermission: Permission.PAYMENT_READ,
    classification: 'read',
    validateInput: (value): value is GetPaymentInput =>
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { paymentId?: unknown }).paymentId === 'string',
    execute: async (input, ctx: AiExecutionContext) => {
      const payment = await paymentsService.getPayment(
        input.paymentId,
        ctx.organizationId,
      );
      return {
        id: payment.id,
        invoiceId: payment.invoiceId,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        providerReference: payment.providerReference,
        status: payment.status,
        confirmedAt: payment.confirmedAt,
      };
    },
  };
}
