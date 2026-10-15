// Money handling for TrustFlow.
//
// Two representations exist at the API boundary (verified against the running
// backend, develop 11158814):
//   - Payments: integer kobo (CreatePaymentDto.amount, @IsInt).
//   - Products: sent as a JSON number, returned as a decimal string in major
//     units ("4500.00"). The major-unit reading is inferred and awaiting
//     confirmation from the backend owner.
//
// Everything here goes through bigint kobo. No floats, ever.

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export type MinorAmount = number | bigint | string;

const HUNDRED = BigInt(100);
const ZERO = BigInt(0);

/** Parse an integer kobo amount from a number, bigint, or integer string. */
export function parseKobo(value: MinorAmount): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new MoneyError(`Kobo amount must be a safe integer, got ${value}`);
    }
    return BigInt(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }
  throw new MoneyError(`Invalid kobo amount: ${String(value)}`);
}

/**
 * Parse a decimal string in major units ("4500.00", "19.99", "0.1") to kobo.
 * Allows at most two decimal places; anything finer is rejected, not rounded.
 */
export function parseDecimalToKobo(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new MoneyError(`Invalid decimal amount: ${value}`);
  const [, sign, whole, fraction = ""] = match;
  const kobo = BigInt(whole) * HUNDRED + BigInt(fraction.padEnd(2, "0"));
  return sign === "-" ? -kobo : kobo;
}

/** Convert kobo to the JSON number the payments API expects. */
export function koboToApiNumber(kobo: bigint): number {
  const asNumber = Number(kobo);
  if (!Number.isSafeInteger(asNumber)) {
    throw new MoneyError("Amount is too large to send as a JSON number");
  }
  return asNumber;
}

function currencySymbol(currency: string, locale: string): string {
  try {
    const part = new Intl.NumberFormat(locale, { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/** Format integer kobo as currency with two decimals, e.g. "₦4,500.00". */
export function formatKobo(
  value: MinorAmount,
  currency = "NGN",
  locale = "en-NG",
): string {
  const kobo = parseKobo(value);
  const negative = kobo < ZERO;
  const abs = negative ? -kobo : kobo;
  const whole = abs / HUNDRED;
  const fraction = (abs % HUNDRED).toString().padStart(2, "0");
  const wholeText = new Intl.NumberFormat(locale).format(whole);
  const symbol = currencySymbol(currency, locale);
  return `${negative ? "-" : ""}${symbol}${wholeText}.${fraction}`;
}

/** Format a decimal string in major units, e.g. a product price "4500.00". */
export function formatDecimal(
  value: string,
  currency = "NGN",
  locale = "en-NG",
): string {
  return formatKobo(parseDecimalToKobo(value), currency, locale);
}
