// app/directives/inlineEdit.ts
import { watch, type Directive, type WatchStopHandle } from 'vue'
import katex from 'katex'

export interface InlineEditBinding {
  get: () => string
  set: (value: string) => void
  onUpdate?: (html: string) => void
  /** Рендерить ли формулы при blur. По умолчанию true */
  renderFormulas?: boolean
}

function renderFormulas(html: string): string {
  if (!html) return ''

  let result = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), {
        displayMode: true,
        throwOnError: false,
        strict: false,
      })
    } catch {
      return `<span class="text-red-500">[Формула: ${latex}]</span>`
    }
  })

  result = result.replace(/\$([^\$\n]+?)\$/g, (_, latex) => {
    try {
      return katex.renderToString(latex.trim(), {
        displayMode: false,
        throwOnError: false,
        strict: false,
      })
    } catch {
      return `<span class="text-red-500">[Формула: ${latex}]</span>`
    }
  })

  return result
}

// Сохранить и восстановить позицию каретки
function saveCaret(el: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!el.contains(range.startContainer)) return null

  const pre = range.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(range.startContainer, range.startOffset)
  const start = pre.toString().length

  pre.setEnd(range.endContainer, range.endOffset)
  const end = pre.toString().length

  return { start, end }
}

function restoreCaret(el: HTMLElement, pos: { start: number; end: number } | null) {
  if (!pos) return
  const sel = window.getSelection()
  if (!sel) return

  let charIndex = 0
  const range = document.createRange()
  range.setStart(el, 0)

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let node: Node | null = walker.nextNode()

  let startNode: Node | null = null
  let startOffset = 0
  let endNode: Node | null = null
  let endOffset = 0

  while (node) {
    const len = node.textContent?.length ?? 0
    const nextIndex = charIndex + len

    if (!startNode && pos.start <= nextIndex) {
      startNode = node
      startOffset = pos.start - charIndex
    }
    if (!endNode && pos.end <= nextIndex) {
      endNode = node
      endOffset = pos.end - charIndex
      break
    }

    charIndex = nextIndex
    node = walker.nextNode()
  }

  if (!startNode) {
    range.selectNodeContents(el)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
    return
  }

  range.setStart(startNode, startOffset)
  range.setEnd(endNode ?? startNode, endOffset)
  sel.removeAllRanges()
  sel.addRange(range)
}

export const vInlineEdit: Directive<HTMLElement, InlineEditBinding> = {
  mounted(el, binding) {
    el.setAttribute('contenteditable', 'true')
    el.classList.add('inline-edit')
    el.spellcheck = false

    // Текущий binding всегда читаем отсюда — updated() его обновляет
    let current: InlineEditBinding = binding.value
    const shouldRender = () => current.renderFormulas !== false

    // Сырое значение модели (LaTeX), последнее, что мы записали в модель
    let rawValue = current.get() ?? ''
    // Флаг: модель меняется из-за нашего же ввода — не переписывать DOM
    let selfUpdate = false

    // Показываем рендеренный вариант в покое
    el.innerHTML = shouldRender() ? renderFormulas(rawValue) : rawValue

    const onDragStart = (e: DragEvent) => e.preventDefault()

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      document.execCommand('insertText', false, text)
    }

    const onFocus = () => {
      if (shouldRender()) {
        el.innerHTML = rawValue
        // Каретка в конец
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    }

    const onBlur = () => {
      rawValue = el.innerHTML
      selfUpdate = true
      current.set(rawValue)
      selfUpdate = false
      if (shouldRender()) {
        el.innerHTML = renderFormulas(rawValue)
      }
    }

    const onInput = () => {
      rawValue = el.innerHTML
      selfUpdate = true
      current.set(rawValue)
      current.onUpdate?.(rawValue)
      selfUpdate = false
    }

    el.addEventListener('dragstart', onDragStart)
    el.addEventListener('paste', onPaste)
    el.addEventListener('focus', onFocus)
    el.addEventListener('blur', onBlur)
    el.addEventListener('input', onInput)

    // watch на актуальный binding через геттер
    const stop: WatchStopHandle = watch(
      () => current.get(),
      (next) => {
        const str = next ?? ''
        rawValue = str

        // Если фокус у нас и это наш собственный апдейт — не трогаем DOM,
        // иначе пользователь потеряет каретку на каждом символе.
        if (document.activeElement === el && selfUpdate) return

        const target = shouldRender() ? renderFormulas(str) : str
        if (el.innerHTML === target) return

        const inFocus = document.activeElement === el
        const caret = inFocus ? saveCaret(el) : null

        el.innerHTML = target
        if (inFocus) restoreCaret(el, caret)
      },
      { immediate: true, flush: 'post' },
      )

    ;(el as any).__inlineEdit = {
      onDragStart, onPaste, onFocus, onBlur, onInput, stop,
      setCurrent: (next: InlineEditBinding) => { current = next },
    }
  },

  updated(el, binding) {
    // Обновляем актуальный binding
    ;(el as any).__inlineEdit?.setCurrent?.(binding.value)
  },

  unmounted(el) {
    const h = (el as any).__inlineEdit
    if (h) {
      el.removeEventListener('dragstart', h.onDragStart)
      el.removeEventListener('paste', h.onPaste)
      el.removeEventListener('focus', h.onFocus)
      el.removeEventListener('blur', h.onBlur)
      el.removeEventListener('input', h.onInput)
      h.stop?.()
      delete (el as any).__inlineEdit
    }
  },
}
