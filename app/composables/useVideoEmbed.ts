// app/composables/useVideoEmbed.ts

const providers = [
  {
    name: 'youtube',
    regex: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/gi,
    embed: (id: string) => `https://www.youtube.com/embed/${id}`,
  },
  {
    name: 'rutube',
    regex: /(?:https?:\/\/)?(?:www\.)?rutube\.ru\/video\/(?:private\/)?([a-z0-9]+)(?:\/)?(?:\?p=([a-z0-9]+))?/gi,
    embed: (id: string, key?: string) => {
      const base = `https://rutube.ru/play/embed/${id}/`
      return key ? `${base}?p=${key}` : base
    },
  },
  {
    name: 'vk',
    // ОБНОВЛЕНО: добавлена поддержка vkvideo.ru
    // Примеры ссылок:
    // https://vk.com/video-12345678_456239017
    // https://vkvideo.ru/video-224474266_456239078
    regex: /(?:https?:\/\/)?(?:www\.)?(?:vk\.com|vkvideo\.ru)\/video(-?\d+_\d+)/gi,
    embed: (id: string) => {
      const [oid, videoId] = id.split('_')
      // Плеер VK всегда отдается с домена vk.com
      return `https://vk.com/video_ext.php?oid=${oid}&id=${videoId}&hd=2`
    },
  },
  {
    name: 'vimeo',
    regex: /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/gi,
    embed: (id: string) => `https://player.vimeo.com/video/${id}`,
  }
]

/**
 * Превращает текстовые ссылки на видео в HTML-блоки с iframe.
 */
export function renderVideos(html: string): string {
  if (!html) return ''
  if (html.includes('class="video-embed')) return html

  const attrRegex = /(href|src)="([^"]*)"/gi
  const masks: string[] = []
  let maskedHtml = html.replace(attrRegex, (match) => {
    masks.push(match)
    return `__ATTR_${masks.length - 1}__`
  })

  maskedHtml = maskedHtml.replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (match, href, text) => {
    if (href.trim() === text.trim() || text.includes('http')) return href
    return match
  })

  for (const p of providers) {
    maskedHtml = maskedHtml.replace(p.regex, (url, id, key) => {
      const embedUrl = p.embed(id, key)
      return `<div class="video-embed relative w-full aspect-video my-2 rounded-lg overflow-hidden border border-default bg-black" data-video-url="${url.trim()}"><iframe class="absolute inset-0 w-full h-full border-0" src="${embedUrl}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write" allowfullscreen></iframe></div>`
    })
  }

  maskedHtml = maskedHtml.replace(/__ATTR_(\d+)__/g, (_, index) => masks[Number(index)])

  return maskedHtml
}

/**
 * Извлекает исходный URL из HTML-блока с видео (для режима редактирования).
 */
export function restoreVideos(html: string): string {
  if (!html) return ''
  return html.replace(/<div[^>]*class="[^"]*video-embed[^"]*"[^>]*data-video-url="([^"]+)"[^>]*>[\s\S]*?<\/div>/gi, '$1')
}

export const useVideoEmbed = () => {
  return { renderVideos, restoreVideos }
}
