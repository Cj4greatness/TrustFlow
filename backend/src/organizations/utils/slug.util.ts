/**
 * Converts a business name into a URL-safe slug, e.g.
 * "Chisom's Electronics Ltd." -> "chisoms-electronics-ltd".
 *
 * A short random suffix is appended by the caller when uniqueness
 * cannot be guaranteed from the name alone (e.g. two businesses
 * named "Fresh Mart").
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function randomSlugSuffix(length = 4): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}
