// app/directives/inlineEdit.ts
import { watch, nextTick, type Directive, type WatchStopHandle } from 'vue'

export interface InlineEditBinding {
  get: () => string
  set: (value: string) => void
  onUpdate?: (html: string) => void
  /** Функция рендера формул (LaTeX → HTML). Если не передана — рендера нет. */
  renderFormulas?: (html: string) => string
}

// ==================== Утилиты нормализации ====================

/** Декодировать HTML-сущности: &amp; → &, &lt; → <, и т.п. */
function decodeHtml(s: string): string {
  const t = document.createElement('textarea')
  t.innerHTML = s
  return t.value
}

/** Убрать все теги, оставить текст. */
function stripTags(s: string): string {
  const t = document.createElement('div')
  t.innerHTML = s
  return t.textContent ?? ''
}

/**
 * Извлечь LaTeX из KaTeX-разметки.
 * KaTeX кладёт исходник в <annotation encoding="application/x-tex">...</annotation>
 * внутри <span class="katex"> или <span class="katex-display">.
 *
 * Возвращает строку, где каждая KaTeX-формула заменена на $...$ или $$...$$.
 * Если в HTML нет KaTeX — вернёт исходный HTML (теги не тронуты — их снимет stripTags).
 */
function restoreLatexFromKatex(html: string): string {
  if (!html || !/class="katex/.test(html)) return html

  // display-mode: <span class="katex-display">...<annotation>...</annotation>...</span>
  // inline:       <span class="katex">...<annotation>...</annotation>...</span>
  // Идём от внешнего .katex-display, если он есть, иначе от .katex.

  let out = html

  // Сначала — display-формулы ($$...$$)
  out = out.replace(
    /<span class="katex-display">[\s\S]*?<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>[\s\S]*?<\/span>/g,
    (_, latex) => `$$${decodeHtml(latex)}$$`
  )

  // Затем — inline-формулы ($...$), которые ещё остались
  out = out.replace(
    /<span class="katex">[\s\S]*?<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>[\s\S]*?<\/span>/g,
    (_, latex) => `$${decodeHtml(latex)}$`
  )

  return out
}

/**
 * Нормализовать HTML из contenteditable в «чистый» текст:
 *  - KaTeX → $...$ (через restoreLatexFromKatex)
 *  - <br>, </div>, </p>, </li> → \n
 *  - убрать zero-width и NBSP
 *  - схлопнуть множественные \n
 *  - снять оставшиеся теги (если нужен plain-text)
 */
function normalizeHtml(html: string): string {
  if (!html) return ''

  // 1. Восстановить формулы
  let out = restoreLatexFromKatex(html)

  // 2. Блочные элементы → \n
  out = out.replace(/<br\s*\/?>/gi, '\n')
  out = out.replace(/<\/(div|p|li|h[1-6])>/gi, '\n')
  out = out.replace(/<(div|p|li|h[1-6])[^>]*>/gi, '')

  // 3. Остальные теги снять (если хотим plain-text)
  out = stripTags(out)

  // 4. Невидимые символы и NBSP
  out = out.replace(/[\u200B-\u200D\uFEFF]/g, '')
  out = out.replace(/\u00A0/g, ' ')

  // 5. Схлопнуть множественные \n
  out = out.replace(/\n{3,}/g, '\n\n')

  return out
}

// ==================== Директива ====================

export const vInlineEdit: Directive<HTMLElement, InlineEditBinding> = {
  mounted(el, binding) {
    el.setAttribute('contenteditable', 'true')
    el.setAttribute('autocorrect', 'off')
    el.setAttribute('autocapitalize', 'off')
    el.setAttribute('spellcheck', 'false')
    el.setAttribute('data-gramm', 'false')
    el.classList.add('inline-edit')

    let current: InlineEditBinding = binding.value

    const render = (raw: string): string => {
      const fn = current.renderFormulas
      return fn ? fn(raw) : raw
    }

    let rawValue = current.get() ?? ''
    let selfUpdate = false

    // Стартовый рендер: если узел не в фокусе — показываем формулы
    if (document.activeElement === el) {
      if (el.innerHTML !== rawValue) el.innerHTML = rawValue
    } else {
      el.innerHTML = render(rawValue)
    }

    // ==================== События ====================

    const onDragStart = (e: DragEvent) => e.preventDefault()

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault()

      const html = e.clipboardData?.getData('text/html') ?? ''
      const text = e.clipboardData?.getData('text/plain') ?? ''

      let payload = text

      if (html) {
        // Восстановим $...$ из KaTeX, если он там есть
        const restored = restoreLatexFromKatex(html)
        // Если после восстановления что-то поменялось — используем HTML-ветку
        if (restored !== html) {
          // Уберём оставшиеся теги, оставим текст с $...$ и переносами
          let cleaned = restored
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(div|p|li|h[1-6])>/gi, '\n')
            .replace(/<(div|p|li|h[1-6])[^>]*>/gi, '')
          cleaned = stripTags(cleaned)
          payload = cleaned
        } else if (html && !text) {
          // На всякий случай: если plain-текста нет, снимем теги с html
          payload = stripTags(html)
        }
      }

      // Вставляем как plain-text — execCommand не даст браузеру добавить свои теги
      document.execCommand('insertText', false, payload)
    }

    // Enter → <br> (Shift+Enter — обычный перенос, тоже <br>)
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        document.execCommand('insertLineBreak')
      }
    }

    const onFocus = () => {
      // Показываем сырой источник (LaTeX с $...$, чистый текст)
      if (el.innerHTML !== rawValue) {
        el.innerHTML = rawValue
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    }

    const onInput = () => {
      // ВАЖНО: пока фокус у нас — innerHTML не трогаем (каретка должна остаться).
      // Модель обновляем нормализованным значением.
      rawValue = normalizeHtml(el.innerHTML)
      selfUpdate = true
      current.set(rawValue)
      current.onUpdate?.(rawValue)
      nextTick(() => {
        selfUpdate = false
      })
    }

    const onBlur = () => {
      rawValue = normalizeHtml(el.innerHTML)
      selfUpdate = true
      current.set(rawValue)
      selfUpdate = false

      nextTick(() => {
        if (document.activeElement === el) return
        const target = render(rawValue)
        if (el.innerHTML !== target) {
          el.innerHTML = target
        }
      })
    }

    el.addEventListener('dragstart', onDragStart)
    el.addEventListener('paste', onPaste)
    el.addEventListener('keydown', onKeydown)
    el.addEventListener('focus', onFocus)
    el.addEventListener('input', onInput)
    el.addEventListener('blur', onBlur)

    // ==================== Watch на модель ====================

    const stop: WatchStopHandle = watch(
      () => current.get(),
      (next) => {
        const str = next ?? ''
        rawValue = str

        // Пока фокус у нас — DOM не трогаем
        if (document.activeElement === el) return
        if (selfUpdate) return

        const target = render(str)
        if (el.innerHTML === target) return

        el.innerHTML = target
      },
      { immediate: true, flush: 'post' },
      )

    ;(el as any).__inlineEdit = {
      onDragStart, onPaste, onKeydown, onFocus, onInput, onBlur, stop,
      setCurrent: (next: InlineEditBinding) => { current = next },
    }
  },

  updated(el, binding) {
    ;(el as any).__inlineEdit?.setCurrent?.(binding.value)
  },

  unmounted(el) {
    const h = (el as any).__inlineEdit
    if (!h) return
    el.removeEventListener('dragstart', h.onDragStart)
    el.removeEventListener('paste', h.onPaste)
    el.removeEventListener('keydown', h.onKeydown)
    el.removeEventListener('focus', h.onFocus)
    el.removeEventListener('input', h.onInput)
    el.removeEventListener('blur', h.onBlur)
    h.stop?.()
    delete (el as any).__inlineEdit
  },
}
