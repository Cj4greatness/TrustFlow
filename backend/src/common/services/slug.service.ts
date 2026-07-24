import { Injectable } from '@nestjs/common';

/**
 * Reusable slug generation utility. Deliberately kept out of any
 * single module (Organizations, and later Products, Customers, etc.
 * will all need this) — a slug is a generic concern, not something
 * specific to organizations.
 *
 * Uniqueness checking is injected as a callback rather than this
 * service taking a repository dependency, so SlugService stays
 * entity-agnostic and reusable across completely different tables.
 */
@Injectable()
export class SlugService {
  generateSlug(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Generates a slug from `input` and appends a deterministic
   * numeric suffix (-2, -3, ...) if needed to satisfy uniqueness,
   * rather than a random suffix — "johnson-electronics-2" is more
   * predictable and readable than a random string, matching the
   * CTO's specified strategy.
   *
   * `exists` is called with each candidate slug and should return
   * whether that slug is already taken.
   */
  async ensureUniqueSlug(
    input: string,
    exists: (candidate: string) => Promise<boolean>,
  ): Promise<string> {
    const base = this.generateSlug(input) || 'item';
    let candidate = base;
    let suffix = 2;

    while (await exists(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }
}
