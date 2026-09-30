// app/composables/useSanitize.ts
import DOMPurify from 'isomorphic-dompurify';

export function useSanitize() {
  function sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
    });
  }

  return { sanitizeHtml };
}
