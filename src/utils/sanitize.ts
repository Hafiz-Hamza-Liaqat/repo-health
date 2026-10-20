/**
 * Safe string sanitization and decoding utilities
 */

/**
 * Safely decodes base64 string handling UTF-8 multibyte characters.
 * Standard window.atob fails on multi-byte characters (emojis, accented text).
 */
export function safeBase64Decode(base64Str: string): string {
  try {
    const cleaned = base64Str.replace(/\s/g, '');
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return decoder.decode(bytes);
  } catch {
    try {
      // Fallback
      return decodeURIComponent(escape(atob(base64Str.replace(/\s/g, ''))));
    } catch {
      return '';
    }
  }
}

/**
 * Escapes HTML characters to prevent XSS when rendering user or repo provided strings.
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Truncates a string to a safe maximum length with ellipsis
 */
export function truncate(str: string, maxLen = 120): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen - 3)}...`;
}
