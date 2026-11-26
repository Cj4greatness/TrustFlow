export type MinorAmountUnit = 'minor';

/**
 * payment.succeeded amount is an integer in minor currency units
 * (for example kobo for NGN). It does not represent major-unit decimals.
 */
export interface PaymentSucceededEvent {
  organizationId: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
  currency: string;
  amountUnit: MinorAmountUnit;
}
