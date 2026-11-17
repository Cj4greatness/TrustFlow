export const MONEY_DECIMAL_PLACES = 2;

const MINOR_UNITS_PER_UNIT = 10n ** BigInt(MONEY_DECIMAL_PLACES);
const DECIMAL_STRING_PATTERN = /^\d+(\.\d{1,2})?$/;

export function decimalStringToMinorUnits(decimalString: string): number {
  if (
    typeof decimalString !== 'string' ||
    !DECIMAL_STRING_PATTERN.test(decimalString)
  ) {
    throw new Error(
      'Invalid monetary value: expected a non-negative decimal string with at most 2 decimal places',
    );
  }

  const [wholeUnits, fractionalUnits = ''] = decimalString.split('.');
  const minorUnits =
    BigInt(wholeUnits) * MINOR_UNITS_PER_UNIT +
    BigInt(fractionalUnits.padEnd(MONEY_DECIMAL_PLACES, '0'));

  if (minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(
      'Monetary value exceeds Number.MAX_SAFE_INTEGER minor units',
    );
  }

  return Number(minorUnits);
}
