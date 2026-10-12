// app/directives/inlineEdit.ts
import { watch, nextTick, type Directive, type WatchStopHandle } from 'vue'

export interface InlineEditBinding {
  get: () => string
  set: (value: string) => void
  onUpdate?: (html: string) => void
  /** Функция рендера формул (LaTeX → HTML). Если не передана — рендера нет. */
  renderFormulas?: (html: string) => string
}

export const vInlineEdit: Directive<HTMLElement, InlineEditBinding> = {
  mounted(el, binding) {
    el.setAttribute('contenteditable', 'true')
    el.classList.add('inline-edit')
    el.spellcheck = false

    let current: InlineEditBinding = binding.value

    const render = (raw: string): string => {
      const fn = current.renderFormulas
      return fn ? fn(raw) : raw
    }

    let rawValue = current.get() ?? ''
    let selfUpdate = false

    if (document.activeElement === el) {
      if (el.innerHTML !== rawValue) el.innerHTML = rawValue
    } else {
      el.innerHTML = render(rawValue)
    }

    const onDragStart = (e: DragEvent) => e.preventDefault()

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      document.execCommand('insertText', false, text)
    }

    const onFocus = () => {
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
      rawValue = el.innerHTML
      selfUpdate = true
      current.set(rawValue)
      current.onUpdate?.(rawValue)
      nextTick(() => {
        selfUpdate = false
      })
    }

    const onBlur = () => {
      rawValue = el.innerHTML
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
    el.addEventListener('focus', onFocus)
    el.addEventListener('input', onInput)
    el.addEventListener('blur', onBlur)

    const stop: WatchStopHandle = watch(
      () => current.get(),
      (next) => {
        const str = next ?? ''
        rawValue = str

        // Пока фокус у нас — не трогаем DOM, каретка остаётся на месте
        if (document.activeElement === el) return
        if (selfUpdate) return

        const target = render(str)
        if (el.innerHTML === target) return

        el.innerHTML = target
      },
      { immediate: true, flush: 'post' },
      )

    ;(el as any).__inlineEdit = {
      onDragStart, onPaste, onFocus, onInput, onBlur, stop,
      setCurrent: (next: InlineEditBinding) => { current = next },
    }
  },

  updated(el, binding) {
    ;(el as any).__inlineEdit?.setCurrent?.(binding.value)
  },

  unmounted(el) {
    const h = (el as any).__inlineEdit
    if (h) {
      el.removeEventListener('dragstart', h.onDragStart)
      el.removeEventListener('paste', h.onPaste)
      el.removeEventListener('focus', h.onFocus)
      el.removeEventListener('input', h.onInput)
      el.removeEventListener('blur', h.onBlur)
      h.stop?.()
      delete (el as any).__inlineEdit
    }
  },
}
