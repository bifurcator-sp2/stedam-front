// app/composables/useSanitize.ts
import DOMPurify from 'isomorphic-dompurify';

export function useSanitize() {
  // Гарантируем безопасные rel для ссылок, открывающихся в новой вкладке
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });

  function sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
      ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel):/i,
    });
  }

  return { sanitizeHtml };
}
