import { badUserInput } from "../lib/errors.js";

// Lowercase alphanumeric segments separated by single hyphens.
// Rejects: empty string, leading/trailing hyphens, consecutive hyphens,
// uppercase letters, spaces, and other punctuation.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const MAX_TAKE = 100;
const DEFAULT_TAKE = 20;

export function assertNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw badUserInput(`${field} must not be empty`, field);
  }
  return value;
}

export function assertValidSlug(slug: string): string {
  if (!SLUG_PATTERN.test(slug)) {
    throw badUserInput(
      `slug "${slug}" is invalid — use lowercase letters, numbers, and single hyphens only (e.g. "my-collection")`,
      "slug"
    );
  }
  return slug;
}

export function normalizeTags(tags: readonly string[] | null | undefined): string[] {
  if (!tags) return [];
  const cleaned = tags.map((t) => t.trim()).filter((t) => t.length > 0);
  // De-dupe while preserving first-seen order.
  return Array.from(new Set(cleaned));
}

export function resolveTake(take: number | null | undefined): number {
  if (take === null || take === undefined) return DEFAULT_TAKE;
  if (!Number.isInteger(take) || take <= 0) {
    throw badUserInput("take must be a positive integer", "take");
  }
  return Math.min(take, MAX_TAKE);
}
