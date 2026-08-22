import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * CreatePaymentDto
 *
 * idempotencyKey is REQUIRED — client-generated, not server-derived.
 * Deliberately not @IsUUID(): the client (whatever UI or integration
 * calls this) may use any stable string generation scheme, not
 * necessarily a UUID. Resending the SAME key on retry returns the
 * original Payment instead of creating a duplicate — see
 * PaymentsService.recordPayment().
 *
 * No invoiceId field — taken from the route
 * (organizations/:id/invoices/:invoiceId/payments), same convention
 * as CreateOrderItemDto not carrying orderId.
 *
 * amount is in kobo (integer, matches Invoice's convention).
 *
 * No `method` field — v1 has exactly one PaymentMethod (MANUAL).
 */
export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  idempotencyKey: string;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  providerReference?: string;
}
