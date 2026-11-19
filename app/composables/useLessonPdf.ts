import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

/**
 * Экспорт урока в PDF.
 *
 * Урок — это «редакторское» представление: заголовок и описание — поля ввода,
 * текст — contenteditable, формулы — KaTeX (вёрстка на инлайн-стилях и
 * ::before/::after), внутри заданий есть кнопки и служебные элементы.
 * Поэлементный обход такого DOM терял текст и ломал макет, поэтому PDF
 * собирается иначе:
 *
 *   1. Урок клонируется в песочницу вне экрана и приводится к «бумажному»
 *      виду: поля ввода → обычный текст, contenteditable → HTML,
 *      интерфейсные элементы вырезаются.
 *   2. Клон растеризуется целиком (html2canvas), поэтому текст, списки,
 *      формулы и изображения сохраняют свою геометрию.
 *   3. Растр нарезается на страницы A4: на каждой странице — один срез.
 *
 * Формат листа — A4, поля по ГОСТ Р 7.0.97-2016:
 * левое 30 мм, правое 15 мм, верхнее и нижнее 20 мм.
 */

// ── Параметры страницы (мм) ──
const PAGE_W = 210
const PAGE_H = 297
const MARGIN = { top: 20, right: 15, bottom: 20, left: 30 }
const CONTENT_W = PAGE_W - MARGIN.left - MARGIN.right
const CONTENT_H = PAGE_H - MARGIN.top - MARGIN.bottom

// ── Растеризация ──
// 1 CSS px = 1/96 in; при 96 px/in область набора A4 — 624 px.
const A4_WIDTH_PX = Math.round((PAGE_W / 25.4) * 96)
const CONTENT_WIDTH_PX = Math.round((CONTENT_W / 25.4) * 96)
// Масштаб рендера: итоговое разрешение вывода примерно 150–190 dpi.
const RASTER_SCALE = 2

const TITLE_SIZE_PT = 18
const DESCRIPTION_SIZE_PT = 11
const DESCRIPTION_COLOR = '#475569'

// Элементы интерфейса, которые не попадают в бумажную версию.
const SKIP_SELECTOR = [
  'button',
  'script',
  'style',
  'noscript',
  '.drag-handle',
  '.cursor-col-resize',
  '[data-drop-zone]',
  '[data-block-action]',
  '[data-htmltext-toolbar]',
  '.block-ghost'
].join(',')

// Источники, которые могли ещё не загрузиться к моменту клонирования
// (песочницу растеризуем сразу, без ожидания сети).
interface CapturedResources {
  images: Map<string, string>
  fontFaces: string[]
}

function captureResources(src: string): CapturedResources {
  const images = new Map<string, string>()
  const fontFaces: string[] = []

  for (const img of Array.from(document.images)) {
    if (!img.complete || !img.naturalWidth) continue
    const imgSrc = img.currentSrc || img.src
    if (!imgSrc || !imgSrc.startsWith(src)) continue
    if (img.naturalWidth * img.naturalHeight > 16_000_000) continue
    try {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.drawImage(img, 0, 0)
      images.set(imgSrc, canvas.toDataURL('image/jpeg', 0.92))
    } catch {
      // Картинка с чужого домена без CORS — останется по своему URL.
    }
  }

  for (const sheet of Array.from(document.styleSheets)) {
    if (sheet.href && !sheet.href.startsWith(src)) continue
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSFontFaceRule) {
          // @ts-expect-error — src есть на CSSFontFaceRule['style'], typings его теряют.
          if (rule.style.src) fontFaces.push(rule.cssText)
        }
      }
    } catch {
      // Правила из недоступных источников пропускаем.
    }
  }

  return { images, fontFaces }
}

/** Пробел между содержательными блоками в CSS-пикселях. */
const BLOCK_GAP_PX = 12

class PdfDocBuilder {
  private host: HTMLElement
  private paper: HTMLElement
  private root: HTMLElement
  private resources: CapturedResources

  constructor(root: HTMLElement, resources: CapturedResources) {
    this.root = root
    this.resources = resources

    this.paper = document.createElement('div')
    this.paper.style.cssText = [
      `width:${CONTENT_WIDTH_PX}px`,
      'padding:0',
      'margin:0',
      'background:#ffffff',
      'color:#000000',
      'box-sizing:border-box',
      'font-size:12pt',
      'line-height:1.45'
    ].join(';')

    // Сама песочница — вне экрана, чтобы не мешать странице.
    this.host = document.createElement('div')
    this.host.setAttribute('aria-hidden', 'true')
    this.host.style.cssText = [
      'position:fixed',
      'top:0',
      'left:-100000px',
      'z-index:-1',
      'pointer-events:none',
      'background:#ffffff',
      `width:${CONTENT_WIDTH_PX}px`,
      'margin:0',
      'padding:0',
      'box-sizing:border-box'
    ].join(';')
  }

  build(): HTMLElement {
    const titleEl = this.root.querySelector('input') as HTMLInputElement | null
    const descEl = this.root.querySelector('textarea') as HTMLTextAreaElement | null

    this.emitHeading(titleEl, 'title')
    this.emitHeading(descEl, 'description')

    const body = this.cloneBody()
    if (body) this.paper.appendChild(body)

    const override = document.createElement('style')
    override.textContent = [
      '#pdf-sandbox * { animation: none !important; transition: none !important; }',
      '#pdf-sandbox table { width: 100% !important; border-collapse: collapse; }',
      '#pdf-sandbox img, #pdf-sandbox svg, #pdf-sandbox canvas { max-width: 100% !important; height: auto !important; }',
      '#pdf-sandbox .katex { font-size: 1.05em; }',
      '#pdf-sandbox .katex-display { margin: 0.5em 0; }',
      ...this.resources.fontFaces
    ].join('\n')

    this.host.id = 'pdf-sandbox'
    this.host.appendChild(override)
    this.host.appendChild(this.paper)
    document.body.appendChild(this.host)

    return this.host
  }

  destroy() {
    this.host.remove()
  }

  private emitHeading(field: HTMLInputElement | HTMLTextAreaElement | null, kind: 'title' | 'description') {
    const value = field?.value?.trim()
    if (!value) return

    const el = document.createElement('div')
    el.className = `pdf-heading pdf-heading--${kind}`
    if (kind === 'title') {
      el.style.cssText = `font-size:${TITLE_SIZE_PT}pt;font-weight:700;line-height:1.25;color:#000000;margin:0 0 ${BLOCK_GAP_PX / 2}px 0;white-space:pre-wrap;word-break:break-word;`
    } else {
      el.style.cssText = `font-size:${DESCRIPTION_SIZE_PT}pt;line-height:1.5;color:${DESCRIPTION_COLOR};margin:0 0 ${BLOCK_GAP_PX}px 0;white-space:pre-wrap;word-break:break-word;`
    }
    el.textContent = value
    this.paper.appendChild(el)
  }

  /**
   * Клонирует содержимое урока, оставляя блоки, и приводит его к бумажному виду.
   * Заголовок/описание и обвязку редактора не переносим.
   */
  private cloneBody(): HTMLElement {
    const clone = this.root.cloneNode(true) as HTMLElement

    const cloneAll = Array.from(clone.querySelectorAll<HTMLElement>('*'))

    // Служебные узлы помечаем и вырезаем (с конца — чтобы не поплыли индексы).
    for (let i = cloneAll.length - 1; i >= 0; i--) {
      const el = cloneAll[i]
      if (!el) continue

      // Поля ввода: значения заголовка/описания уже выведены отдельно,
      // остальные поля (поиск, загрузка файлов) — служебные.
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.remove()
        continue
      }

      if (el.matches(SKIP_SELECTOR) || el.classList.contains('print:hidden')) {
        el.remove()
        continue
      }

      // В режиме редактирования текст урока — contenteditable: снимаем
      // атрибут, чтобы в растр не попала каретка. Содержимое уже в клоне.
      if (el.hasAttribute('contenteditable')) {
        el.setAttribute('contenteditable', 'false')
        el.removeAttribute('spellcheck')
        el.style.outline = 'none'
      }
    }

    // Изображения — во встроенные data-URL, чтобы они точно попали в растр.
    clone.querySelectorAll('img').forEach((img) => {
      const original = img.getAttribute('src') || ''
      const data = this.resources.images.get(original)
      if (data) img.setAttribute('src', data)
      img.setAttribute('loading', 'eager')
      img.removeAttribute('crossorigin')
    })

    // Обёртка урока: центрирующий flex с gap не нужен бумаге.
    clone.removeAttribute('id')
    clone.style.cssText = 'display:block;gap:0;margin:0;padding:0;background:#ffffff;color:#000000;'
    clone.classList.remove('is-printing')

    // Пустые обёртки полей ввода (заголовок и описание уже выведены
    // отдельно) убираем, чтобы не оставалось пустого места.
    for (const box of Array.from(clone.children)) {
      if (box.tagName !== 'DIV') continue
      if (box.hasChildNodes() && box.textContent?.trim()) continue
      if (box.querySelector('img, svg, table, canvas, video')) continue
      box.remove()
    }

    return clone
  }
}

/**
 * Сохраняет контейнер урока (DOM) в PDF.
 * @param root — корневой контейнер урока (обычно contentRef).
 * @param fileName — имя файла без расширения.
 */
export async function exportLessonToPdf(root: HTMLElement, fileName: string): Promise<void> {
  if (typeof document === 'undefined') return

  const src = document.location.href
  const builder = new PdfDocBuilder(root, captureResources(src))

  try {
    const host = builder.build()

    // Даём браузеру посчитать layout песочницы (шрифты, картинки).
    void host.offsetHeight
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    await document.fonts?.ready

    const canvas = await html2canvas(host, {
      backgroundColor: '#ffffff',
      scale: RASTER_SCALE,
      useCORS: true,
      allowTaint: false,
      logging: false,
      width: CONTENT_WIDTH_PX,
      windowWidth: A4_WIDTH_PX,
      scrollX: 0,
      scrollY: 0
    })

    if (!canvas.width || !canvas.height) {
      throw new Error('Пустой результат растеризации урока')
    }

    const pdf = new jsPDF({ format: 'a4', orientation: 'portrait', unit: 'mm', compress: true })

    // Сколько пикселей растра помещается в одну страницу по высоте.
    const pxPerMm = canvas.width / CONTENT_W
    const pageHeightPx = Math.floor(CONTENT_H * pxPerMm)
    // Небольшой перехлёст, чтобы не разрезать строку пополам (не более 2 мм).
    const overlapPx = Math.min(Math.round(2 * pxPerMm), Math.floor(pageHeightPx * 0.05))

    let offset = 0
    let page = 0

    while (offset < canvas.height) {
      const sliceHeight = Math.min(pageHeightPx, canvas.height - offset)
      if (sliceHeight <= 0) break

      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = sliceHeight
      const ctx = slice.getContext('2d')
      if (!ctx) break
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, slice.width, slice.height)
      ctx.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)

      if (page > 0) pdf.addPage()
      pdf.addImage(
        slice.toDataURL('image/jpeg', 0.92),
        'JPEG',
        MARGIN.left,
        MARGIN.top,
        CONTENT_W,
        sliceHeight / pxPerMm,
        undefined,
        'FAST'
      )

      page += 1
      if (offset + sliceHeight >= canvas.height) break
      offset += Math.max(1, pageHeightPx - overlapPx)
    }

    if (page === 0) throw new Error('Не удалось сформировать страницы PDF')

    pdf.save(`${fileName || 'lesson'}.pdf`)
  } finally {
    builder.destroy()
  }
}

/** Хук-обёртка с нормализацией имени файла. */
export function useLessonPdf() {
  async function exportPdf(root: HTMLElement, title: string | null | undefined) {
    const safe = (title ?? '')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100)
    await exportLessonToPdf(root, safe || 'lesson')
  }

  return { exportPdf }
}
