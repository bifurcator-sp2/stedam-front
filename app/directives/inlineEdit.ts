// app/directives/inlineEdit.ts
import { watch, type Directive } from 'vue'
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

export const vInlineEdit: Directive<HTMLElement, InlineEditBinding> = {
  mounted(el, binding) {
    el.setAttribute('contenteditable', 'true')
    el.classList.add('inline-edit')
    el.spellcheck = false

    const shouldRender = binding.value?.renderFormulas !== false

    // Исходный LaTeX — что хранится в модели
    let rawValue = binding.value.get() ?? ''
    // Рендеренный HTML — что показывается при blur
    const rendered = shouldRender ? renderFormulas(rawValue) : rawValue

    // Показываем рендеренный вариант в покое
    el.innerHTML = rendered

    const onDragStart = (e: DragEvent) => e.preventDefault()

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      document.execCommand('insertText', false, text)
    }

    const onFocus = () => {
      // При фокусе показываем исходный LaTeX для редактирования
      if (shouldRender) {
        el.innerHTML = rawValue
      }
    }

    const onBlur = () => {
      // При blur — сохраняем то, что отредактировали, и рендерим формулы
      rawValue = el.innerHTML
      binding.value.set(rawValue)
      if (shouldRender) {
        el.innerHTML = renderFormulas(rawValue)
      }
    }

    const onInput = () => {
      // Пока печатают — обновляем только модель, DOM остаётся с LaTeX
      rawValue = el.innerHTML
      binding.value.set(rawValue)
      binding.value?.onUpdate?.(rawValue)
    }

    el.addEventListener('dragstart', onDragStart)
    el.addEventListener('paste', onPaste)
    el.addEventListener('focus', onFocus)
    el.addEventListener('blur', onBlur)
    el.addEventListener('input', onInput)

    const stop = watch(
      () => binding.value.get(),
      (next) => {
        // Внешнее изменение модели — пересобираем содержимое
        if (document.activeElement === el) return
        const str = next ?? ''
        rawValue = str
        const target = shouldRender ? renderFormulas(str) : str
        if (el.innerHTML !== target) {
          el.innerHTML = target
        }
      },
      { immediate: true },
      )

    ;(el as any).__inlineEdit = {
      onDragStart, onPaste, onFocus, onBlur, onInput, stop,
    }
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
