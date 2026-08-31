import { ValueTransformer } from 'typeorm';

export class KoboTransformer implements ValueTransformer {
  to(value: number | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    if (!Number.isInteger(value)) {
      throw new Error(
        `KoboTransformer: expected an integer minor-unit value, got ${value}. ` +
          `Money must never reach the database as a decimal or float.`,
      );
    }
    return value;
  }

  from(value: string | null): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(
        `KoboTransformer: value ${value} exceeds Number.MAX_SAFE_INTEGER on read. ` +
          `This column may need bigint-safe string arithmetic instead of this transformer.`,
      );
    }
    return parsed;
  }
}
