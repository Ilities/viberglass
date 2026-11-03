/** A `?redirect=` value if it stays on this origin, else `/`. `//host` and `/\host` are protocol-relative to browsers. */
export function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith('/')) return '/'
  if (value[1] === '/' || value[1] === '\\') return '/'
  if (/[\u0000-\u001f]/.test(value)) return '/'
  return value
}
