import { InvoicesService } from '../../invoices/invoices.service';
import { Permission } from '../../authorization/permissions.enum';
import { AiTool, AiExecutionContext } from './ai-tool.interface';

export interface GetInvoiceInput {
  invoiceId: string;
}

export interface GetInvoiceOutput {
  id: string;
  invoiceNumber: string;
  orderId: string;
  customerId: string;
  status: string;
  issueDate: Date | null;
  dueDate: Date | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  notes: string | null;
}

/**
 * get_invoice
 *
 * Third Tool Registry entry, mirroring get_customer/get_order's
 * shape: read-only, org-scoped via
 * InvoicesRepository.getOwnedInvoiceOrThrow (called internally by
 * getInvoice()) — no new tenant-isolation logic introduced.
 *
 * NOTE: InvoicesService.getInvoice() takes (id, organizationId) —
 * the REVERSE argument order from OrdersService.getOrder()'s
 * (organizationId, orderId). Preserved here exactly as the service
 * defines it, not normalized to match get_order's order.
 *
 * Monetary fields (subtotal, discountAmount, taxAmount, total,
 * amountPaid, amountDue) are returned as raw kobo integers, matching
 * the entity's storage — no currency conversion performed here.
 *
 * Output omits organizationId (redundant), createdBy and
 * flaggedForReview (internal bookkeeping/review-workflow state, no
 * obvious AI-facing use per the same reasoning as prior tools).
 */
export function createGetInvoiceTool(
  invoicesService: InvoicesService,
): AiTool<GetInvoiceInput, GetInvoiceOutput> {
  return {
    name: 'get_invoice',
    description:
      "Fetch a single invoice's details by ID, scoped to the caller's organization.",
    inputSchema: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', format: 'uuid' },
      },
      required: ['invoiceId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        invoiceNumber: { type: 'string' },
        orderId: { type: 'string' },
        customerId: { type: 'string' },
        status: { type: 'string' },
        issueDate: { type: ['string', 'null'], format: 'date-time' },
        dueDate: { type: ['string', 'null'], format: 'date-time' },
        subtotal: { type: 'number' },
        discountAmount: { type: 'number' },
        taxAmount: { type: 'number' },
        total: { type: 'number' },
        amountPaid: { type: 'number' },
        amountDue: { type: 'number' },
        currency: { type: 'string' },
        notes: { type: ['string', 'null'] },
      },
    },
    requiredPermission: Permission.INVOICE_READ,
    classification: 'read',
    validateInput: (value): value is GetInvoiceInput =>
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { invoiceId?: unknown }).invoiceId === 'string',
    execute: async (input, ctx: AiExecutionContext) => {
      const invoice = await invoicesService.getInvoice(
        input.invoiceId,
        ctx.organizationId,
      );
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        orderId: invoice.orderId,
        customerId: invoice.customerId,
        status: invoice.status,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        subtotal: invoice.subtotal,
        discountAmount: invoice.discountAmount,
        taxAmount: invoice.taxAmount,
        total: invoice.total,
        amountPaid: invoice.amountPaid,
        amountDue: invoice.amountDue,
        currency: invoice.currency,
        notes: invoice.notes,
      };
    },
  };
}
