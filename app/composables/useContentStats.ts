// app/composables/useContentStats.ts

import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  toValue,
  type Ref,
  type MaybeRefOrGetter,
} from 'vue'

export interface ContentStats {
  plainChars: number
  formulaChars: number
  words: number
}

export interface UseContentStatsOptions {
  /** Контейнер, внутри которого ищем контент. Обязателен. */
  container: Ref<HTMLElement | null>

  /**
   * Текст, который не находится внутри контейнера (title, description).
   * Может быть ref, getter или строкой. Формулы в нём ($...$) тоже считаются.
   */
  headText?: MaybeRefOrGetter<string>

  /** Скорость чтения — символов в минуту. По умолчанию 1000. */
  charsPerMinute?: number

  /**
   * Вес одного символа формулы в эквиваленте обычных символов.
   * По умолчанию 2.
   */
  formulaWeight?: number

  /** Задержка после последнего изменения DOM, мс. По умолчанию 120. */
  debounceMs?: number

  /**
   * Если задан — считаем только элементы, подходящие под этот селектор.
   * Если не задан — считаем весь контейнер.
   * Пример: '[data-lesson-content-body]'
   */
  contentSelector?: string

  /** Дополнительные селекторы формул (поверх встроенных). */
  formulaSelectors?: string[]

  /**
   * Дополнительные селекторы UI внутри контента, которые не нужно считать.
   * Встроенные: button, [role="button"], .drag-handle,
   *             [data-block-action], [data-ui-skip].
   */
  skipSelectors?: string[]

  /**
   * Реактивный источник, при изменении которого пересчитываем.
   * Страховка от изменений модели, которые ещё не отразились в DOM.
   */
  watchSource?: () => unknown
}

const DEFAULT_FORMULA_SELECTORS = [
  '.katex-display',
  '.katex',
  'mjx-container',
  'math',
  '[data-formula]',
  '[data-latex]',
]

const DEFAULT_SKIP_SELECTORS = [
  'button',
  '[role="button"]',
  '.drag-handle',
  '[data-block-action]',
  '[data-ui-skip]',
]

export function useContentStats(options: UseContentStatsOptions) {
  const {
    container,
    headText,
    charsPerMinute = 1000,
    formulaWeight = 2,
    debounceMs = 120,
    contentSelector,
    formulaSelectors = [],
    skipSelectors = [],
    watchSource,
  } = options

  const allFormulaSelector = [...DEFAULT_FORMULA_SELECTORS, ...formulaSelectors].join(',')
  const allSkipSelector = [...DEFAULT_SKIP_SELECTORS, ...skipSelectors].join(',')

  const stats = ref<ContentStats>({ plainChars: 0, formulaChars: 0, words: 0 })

  // ---------- Внутренние хелперы ----------

  function outermostFormulas(root: HTMLElement): Element[] {
    const all = Array.from(root.querySelectorAll(allFormulaSelector))
    const result: Element[] = []
    for (const el of all) {
      if (result.some((o) => o === el || o.contains(el))) continue
      const innerIdx = result.findIndex((o) => el.contains(o))
      if (innerIdx >= 0) result[innerIdx] = el
      else result.push(el)
    }
    return result
  }

  function formulaLatexOf(el: Element): string {
    const ann = el.querySelector('annotation[encoding="application/x-tex"]')
    if (ann?.textContent) return ann.textContent

    const attr =
      el.getAttribute('data-latex')
      ?? el.getAttribute('data-tex')
      ?? el.querySelector('[data-latex]')?.getAttribute('data-latex')
      ?? el.querySelector('[data-tex]')?.getAttribute('data-tex')
    if (attr) return attr

    return el.textContent ?? ''
  }

  function textFromDom(root: HTMLElement, skipEls: Set<Element>): string {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const parts: string[] = []
    let node: Node | null

    while ((node = walker.nextNode())) {
      const txt = node.nodeValue
      if (!txt) continue

      let parent = node.parentElement
      let skip = false
      while (parent && parent !== root) {
        if (skipEls.has(parent) || parent.matches(allSkipSelector)) {
          skip = true
          break
        }
        parent = parent.parentElement
      }
      if (skip) continue

      if (!txt.trim()) {
        if (parts.length > 0) parts.push(' ')
        continue
      }
      parts.push(txt)
    }

    return parts.join('')
  }

  function extractInline(text: string): ContentStats {
    let formulaChars = 0
    let t = text

    t = t.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex: string) => {
      formulaChars += latex.replace(/\s+/g, '').length
      return ' '
    })
    t = t.replace(/\$([^\$\n]+?)\$/g, (_, latex: string) => {
      formulaChars += latex.replace(/\s+/g, '').length
      return ' '
    })

    const plain = t
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    return {
      plainChars: plain.replace(/\s+/g, '').length,
      formulaChars,
      words: plain.split(/\s+/).filter(Boolean).length,
    }
  }

  // ---------- Пересчёт ----------

  function recalc() {
    if (!import.meta.client) return

    const head = extractInline(toValue(headText) ?? '')
    const root = container.value

    if (!root) {
      stats.value = head
      return
    }

    const bodies: HTMLElement[] = contentSelector
      ? Array.from(root.querySelectorAll<HTMLElement>(contentSelector))
      : [root]

    let plainAll = ''
    let formulaChars = 0

    for (const body of bodies) {
      const formulaEls = outermostFormulas(body)
      for (const el of formulaEls) {
        formulaChars += formulaLatexOf(el).replace(/\s+/g, '').length
      }
      plainAll += ' ' + textFromDom(body, new Set(formulaEls))
    }

    // Добираем $...$ и $$...$$, которые ещё не превратились в DOM-элементы
    plainAll = plainAll.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex: string) => {
      formulaChars += latex.replace(/\s+/g, '').length
      return ' '
    })
    plainAll = plainAll.replace(/\$([^\$\n]+?)\$/g, (_, latex: string) => {
      formulaChars += latex.replace(/\s+/g, '').length
      return ' '
    })

    plainAll = plainAll
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const plainChars = plainAll.replace(/\s+/g, '').length
    const words = plainAll.split(/\s+/).filter(Boolean).length

    stats.value = {
      plainChars: head.plainChars + plainChars,
      formulaChars: head.formulaChars + formulaChars,
      words: head.words + words,
    }
  }

  // ---------- Дебаунс: rAF + setTimeout ----------

  let rafId: number | null = null
  let debounceId: ReturnType<typeof setTimeout> | null = null

  function cancelPending() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (debounceId !== null) {
      clearTimeout(debounceId)
      debounceId = null
    }
  }

  function scheduleRecalc() {
    if (!import.meta.client) return
    cancelPending()
    rafId = requestAnimationFrame(() => {
      rafId = null
      debounceId = setTimeout(() => {
        debounceId = null
        recalc()
      }, debounceMs)
    })
  }

  // ---------- MutationObserver ----------

  let observer: MutationObserver | null = null

  function attachObserver(el: HTMLElement | null) {
    observer?.disconnect()
    observer = null
    if (!el || !import.meta.client) return

    observer = new MutationObserver(() => scheduleRecalc())
    observer.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }

  onMounted(() => {
    attachObserver(container.value)
    scheduleRecalc()
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
    cancelPending()
  })

  // Если контейнер появится/сменится позже (v-if, ref)
  watch(container, (el) => {
    attachObserver(el)
    scheduleRecalc()
  }, { flush: 'post' })

  // Реактивный источник — страховка от изменений модели
  if (watchSource) {
    watch(watchSource, () => scheduleRecalc(), { deep: true, flush: 'post' })
  }

  // Заголовок / описание
  if (headText) {
    watch(() => toValue(headText), () => scheduleRecalc(), { flush: 'post' })
  }

  // ---------- Публичные вычисляемые ----------

  const totalChars = computed(
    () => stats.value.plainChars + stats.value.formulaChars,
  )

  const readingTimeText = computed(() => {
    const effectiveChars =
      stats.value.plainChars + stats.value.formulaChars * formulaWeight
    if (effectiveChars === 0) return '0 сек'

    const minutes = effectiveChars / charsPerMinute
    if (minutes < 1) return `${Math.round(minutes * 60)} сек`

    const wholeMinutes = Math.floor(minutes)
    const seconds = Math.round((minutes - wholeMinutes) * 60)
    if (seconds === 0) return `${wholeMinutes} мин`
    return `${wholeMinutes} мин ${seconds} сек`
  })

  return {
    /** Реактивный «сырой» объект со статистикой. */
    stats,
    /** plainChars + formulaChars. */
    totalChars,
    /** Отформатированное «≈ N мин M сек». */
    readingTimeText,
    /** Принудительный пересчёт (напр., после программной замены DOM). */
    recalc,
    /** Планирование пересчёта (дебаунс). */
    scheduleRecalc,
  }
}
