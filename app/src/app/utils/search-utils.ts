/**
 * Google-like search: splits `query` by whitespace into tokens.
 * All tokens must match case-insensitively in `text`.
 * If a token contains "*", it is treated as a wildcard matching any characters.
 */
export function matchesSearch(query: string, text: string): boolean {
  const q = (query ?? '').trim();
  if (!q) return true;
  const lowerText = text.toLowerCase();
  return q.split(/\s+/).every((token) => {
    if (!token) return true;
    if (token.includes('*')) {
      const pattern = token.split('*').map(escapeRegExp).join('.*');
      return new RegExp(pattern, 'i').test(text);
    }
    return lowerText.includes(token.toLowerCase());
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
