// app/composables/useVideoEmbed.ts

const providers = [
  {
    name: 'youtube',
    // Примеры ссылок, которые будут обработаны:
    // https://www.youtube.com/watch?v=dQw4w9WgXcQ
    // https://youtu.be/dQw4w9WgXcQ
    // https://www.youtube.com/embed/dQw4w9WgXcQ
    // https://www.youtube.com/v/dQw4w9WgXcQ
    // https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s
    regex: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/gi,
    embed: (id: string) => `https://www.youtube.com/embed/${id}`,
  },
  {
    name: 'rutube',
    // Примеры ссылок, которые будут обработаны:
    // https://rutube.ru/video/1a2b3c4d5e6f7g8h9i0j/
    // https://rutube.ru/video/1a2b3c4d5e6f7g8h9i0j/?p=12345
    // http://rutube.ru/video/1a2b3c4d5e6f7g8h9i0j
    regex: /(?:https?:\/\/)?(?:www\.)?rutube\.ru\/video\/([a-z0-9]+)\/?/gi,
    embed: (id: string) => `https://rutube.ru/play/embed/${id}`,
  },
  {
    name: 'vk',
    // Примеры ссылок, которые будут обработаны:
    // https://vk.com/video-12345678_456239017
    // https://vk.com/video12345678_456239017 (без минуса)
    // https://vk.com/video-12345678_456239017?list=abc123
    regex: /(?:https?:\/\/)?(?:www\.)?vk\.com\/video(-?\d+_\d+)/gi,
    embed: (id: string) => {
      const [oid, videoId] = id.split('_')
      return `https://vk.com/video_ext.php?oid=${oid}&id=${videoId}&hd=2`
    },
  },
  {
    name: 'vimeo',
    // Примеры ссылок, которые будут обработаны:
    // https://vimeo.com/123456789
    // https://www.vimeo.com/123456789
    // https://vimeo.com/123456789?share=copy
    regex: /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/gi,
    embed: (id: string) => `https://player.vimeo.com/video/${id}`,
  }
]

/**
 * Превращает текстовые ссылки на видео в HTML-блоки с iframe.
 */
export function renderVideos(html: string): string {
  if (!html) return ''
  // Предотвращаем повторную обработку уже вставленных видео
  if (html.includes('class="video-embed')) return html

  // Временно маскируем href и src атрибуты, чтобы не заменять ссылки внутри тегов <a>
  const attrRegex = /(href|src)="([^"]*)"/gi
  const masks: string[] = []
  let maskedHtml = html.replace(attrRegex, (match) => {
    masks.push(match)
    return `__ATTR_${masks.length - 1}__`
  })

  // Убираем обертку <a> вокруг ссылки, оставляя только текст, чтобы блок выглядел чисто
  maskedHtml = maskedHtml.replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (match, href, text) => {
    if (href.trim() === text.trim() || text.includes('http')) return href
    return match
  })

  for (const p of providers) {
    maskedHtml = maskedHtml.replace(p.regex, (url, id) => {
      const embedUrl = p.embed(id)
      // Возвращаем адаптивный контейнер Tailwind (w-full aspect-video)
      return `<div class="video-embed relative w-full aspect-video my-2 rounded-lg overflow-hidden border border-default bg-black" data-video-url="${url.trim()}"><iframe class="absolute inset-0 w-full h-full border-0" src="${embedUrl}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`
    })
  }

  // Возвращаем атрибуты на место
  maskedHtml = maskedHtml.replace(/__ATTR_(\d+)__/g, (_, index) => masks[Number(index)])

  return maskedHtml
}

/**
 * Извлекает исходный URL из HTML-блока с видео (для режима редактирования).
 */
export function restoreVideos(html: string): string {
  if (!html) return ''
  // Ищем наш контейнер и заменяем его на исходный URL из атрибута data-video-url
  return html.replace(/<div[^>]*class="[^"]*video-embed[^"]*"[^>]*data-video-url="([^"]+)"[^>]*>[\s\S]*?<\/div>/gi, '$1')
}

export const useVideoEmbed = () => {
  return { renderVideos, restoreVideos }
}
