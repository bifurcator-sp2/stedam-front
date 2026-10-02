/**
 * Парсит токен вида "bg-definition" / "border-theorem" / "accent-quote"
 * и возвращает { prefix, name, cssVar, hex }.
 */
export function parseColorToken(token: string | undefined | null) {
  if (!token) return null

  const match = token.match(/^(bg|border|accent)-(.+)$/)
  if (!match) return null

  const [, prefix, name] = match

  return {
    prefix,                              // 'bg' | 'border' | 'accent'
    name,                                // 'definition'
    cssVar: `--${prefix}-${name}`,       // '--bg-definition'
    varExpr: `var(--${prefix}-${name})`, // 'var(--bg-definition)'
  }
}

/**
 * Достаёт актуальное значение CSS-переменной из :root / .dark.
 * Работает в браузере; на SSR вернёт fallback.
 */
export function resolveCssVar(varName: string, fallback = 'transparent'): string {
  if (import.meta.server) return fallback
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim()
  return value || fallback
}
