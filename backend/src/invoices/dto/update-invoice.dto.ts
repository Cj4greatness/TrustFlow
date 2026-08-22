import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * UpdateInvoiceDto
 *
 * Deliberately narrow. Per Invoice's status-transition rule (enforced
 * in the service layer, not the DTO), only notes/dueDate are ever
 * safely patchable, and only while status = DRAFT — InvoicesService
 * must reject this update once an Invoice is ISSUED or later,
 * mirroring how OrdersService guards edits after CONFIRMED.
 *
 * No status field here on purpose: status transitions (issue, void,
 * mark-paid via Payment) are distinct actions with their own rules
 * and side effects (e.g. issuing sets issueDate, recording a Payment
 * recalculates amountPaid/amountDue) — they should be separate
 * service methods / endpoints (e.g. POST /invoices/:id/issue), not a
 * generic PATCH that lets a client set status directly. Same
 * reasoning as why Order's status transitions aren't a plain field
 * update.
 *
 * No monetary fields, no orderId/customerId, no line items — none of
 * those are legitimately editable after creation; a wrong Order
 * reference or wrong amount means voiding and recreating the invoice,
 * not patching it.
 */
export class UpdateInvoiceDto {
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
