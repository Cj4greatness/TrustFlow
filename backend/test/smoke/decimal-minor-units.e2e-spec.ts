import {
  decimalStringToMinorUnits,
  MONEY_DECIMAL_PLACES,
} from '../../src/common/money/decimal-minor-units';

describe('decimalStringToMinorUnits (e2e)', () => {
  it('exports the supported decimal precision', () => {
    expect(MONEY_DECIMAL_PLACES).toBe(2);
  });

  it.each([
    ['0', 0],
    ['0.1', 10],
    ['0.10', 10],
    ['0.01', 1],
    ['19.99', 1999],
    ['59.97', 5997],
    ['99.99', 9999],
    ['10000.00', 1000000],
    ['1000000.00', 100000000],
    ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ])('converts %s to %d minor units exactly', (decimal, expected) => {
    expect(decimalStringToMinorUnits(decimal)).toBe(expected);
  });

  it.each(['1.005', '1.234', '1e3', ' 1.00', '', 'abc', '-1.00'])(
    'rejects invalid decimal string %j',
    (decimal) => {
      expect(() => decimalStringToMinorUnits(decimal)).toThrow(
        'Invalid monetary value',
      );
    },
  );

  it.each(['90071992547409.92', '99999999999999.99'])(
    'rejects values beyond the safe integer range: %s',
    (decimal) => {
      expect(() => decimalStringToMinorUnits(decimal)).toThrow(RangeError);
    },
  );
});
