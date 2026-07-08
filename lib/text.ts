/**
 * Sentence-case a display label: uppercase the first letter, leave the rest as
 * authored. Used for mono status words and micro-labels that used to render as
 * ALLCAPS via a CSS `uppercase` class — the app now shows normal, sentence-case
 * words (never ALLCAPS, never all-lowercase). Not Title Case: only the first
 * letter changes, so "in transit" → "In transit" and "all types" → "All types".
 */
export function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
