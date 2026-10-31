export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** One token, so a prefix or a word inside the field can match. Multi-word queries stay on $text. */
export function isSingleToken(value: string): boolean {
  return value.trim().length > 0 && !/\s/.test(value);
}

/** Anchored prefix or a word boundary, case-insensitive. User input is escaped. */
export function tokenMatch(value: string): { $regex: string; $options: 'i' } {
  return { $regex: `(^|\\b)${escapeRegex(value.trim())}`, $options: 'i' };
}
