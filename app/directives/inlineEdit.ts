// app/directives/inlineEdit.ts
import { watch, nextTick, type Directive, type WatchStopHandle } from 'vue'
import { restoreVideos } from '~/composables/useVideoEmbed'

export interface InlineEditBinding {
  get: () => string
  set: (value: string) => void
  onUpdate?: (html: string) => void
  renderFormulas?: (html: string) => string
}

function decodeHtml(s: string): string {
  const t = document.createElement('textarea')
  t.innerHTML = s
  return t.value
}

function stripTags(s: string): string {
  const t = document.createElement('div')
  t.innerHTML = s
  return t.textContent ?? ''
}

function restoreLatexFromKatex(html: string): string {
  if (!html || !/class="katex/.test(html)) return html
  let out = html
  out = out.replace(
    /<span class="katex-display">[\s\S]*?<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>[\s\S]*?<\/span>/g,
    (_, latex) => `$$${decodeHtml(latex)}$$`
  )
  out = out.replace(
    /<span class="katex">[\s\S]*?<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>[\s\S]*?<\/span>/g,
    (_, latex) => `$${decodeHtml(latex)}$`
  )
  return out
}

function normalizeHtml(html: string): string {
  if (!html) return ''
  let out = restoreLatexFromKatex(html)
  out = restoreVideos(out)
  out = out.replace(/<br\s*\/?>/gi, '\n')
  out = out.replace(/<\/(div|p|li|h[1-6])>/gi, '\n')
  out = out.replace(/<(div|p|li|h[1-6])[^>]*>/gi, '')
  out = stripTags(out)
  out = out.replace(/[\u200B-\u200D\uFEFF]/g, '')
  out = out.replace(/\u00A0/g, ' ')
  out = out.replace(/\n{3,}/g, '\n\n')
  return out
}

export const vInlineEdit: Directive<HTMLElement, InlineEditBinding> = {
  mounted(el, binding) {
    // 👇 ЗАЩИТА: если значения нет, ничего не делаем
    if (!binding.value) return

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

    if (document.activeElement === el) {
      if (el.innerHTML !== rawValue) el.innerHTML = rawValue
    } else {
      el.innerHTML = render(rawValue)
    }

    const onDragStart = (e: DragEvent) => e.preventDefault()

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault()
      const html = e.clipboardData?.getData('text/html') ?? ''
      const text = e.clipboardData?.getData('text/plain') ?? ''
      let payload = text

      if (html) {
        const restored = restoreLatexFromKatex(html)
        if (restored !== html) {
          let cleaned = restored
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(div|p|li|h[1-6])>/gi, '\n')
            .replace(/<(div|p|li|h[1-6])[^>]*>/gi, '')
          cleaned = stripTags(cleaned)
          payload = cleaned
        } else if (html && !text) {
          payload = stripTags(html)
        }
      }
      document.execCommand('insertText', false, payload)
    }

    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        document.execCommand('insertLineBreak')
      }
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

    const stop: WatchStopHandle = watch(
      () => current.get(),
      (next) => {
        const str = next ?? ''
        rawValue = str

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
    // 👇 ЗАЩИТА: если пришло undefined, отключаем редактирование
    if (!binding.value) {
      el.removeAttribute('contenteditable')
      ;(el as any).__inlineEdit?.stop?.()
      delete (el as any).__inlineEdit
      return
    }
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
