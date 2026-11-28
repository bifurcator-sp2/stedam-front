/**
 * Отслеживание «прочитанности» элемента по видимости во вьюпорте.
 *
 * Элемент считается прочитанным, если он виден на экране более чем на 2/3
 * по площади дольше трёх секунд подряд. Композабл сам вешает
 * IntersectionObserver и таймер, а наружу отдаёт `target` — ref для привязки
 * к корневому DOM-узлу. Когда элемент прочитан, вызывается `onRead`
 * (однократно); эмит события остаётся за компонентом уведомления.
 */
export interface UseWasReadOptions {
  /** Доля площади элемента, видимая на экране (0..1). По умолчанию 2/3. */
  threshold?: number
  /** Сколько элемент должен оставаться видимым подряд, мс. По умолчанию 3000. */
  duration?: number
  /** Колбэк, вызываемый один раз, когда элемент признан прочитанным. */
  onRead?: () => void
}

export const useWasRead = (options: UseWasReadOptions = {}) => {
  const threshold = options.threshold ?? 2 / 3
  const duration = options.duration ?? 3000

  /** Ссылка на корневой DOM-узел уведомления. */
  const target = ref<HTMLElement | null>(null)

  let observer: IntersectionObserver | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let done = false

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function teardown() {
    clearTimer()
    observer?.disconnect()
    observer = null
  }

  function markRead() {
    if (done) return
    done = true
    teardown()
    options.onRead?.()
  }

  /** Доля площади элемента, попавшая во вьюпорт (0..1). */
  function visibleRatio(entry: IntersectionObserverEntry): number {
    const targetArea = entry.boundingClientRect.width * entry.boundingClientRect.height
    if (!targetArea) return 0
    const visibleArea = entry.intersectionRect.width * entry.intersectionRect.height
    return visibleArea / targetArea
  }

  // В SSR IntersectionObserver нет — отслеживание работает только на клиенте.
  if (import.meta.client) {
    observer = new IntersectionObserver(
      (entries) => {
        if (done) return

        const entry = entries[0]
        const isVisible = !!entry
          && entry.isIntersecting
          && visibleRatio(entry) > threshold

        if (!isVisible) {
          // Ушёл из кадра до истечения таймера — отсчёт начинается заново.
          clearTimer()
          return
        }

        if (!timer) {
          timer = setTimeout(markRead, duration)
        }
      },
      { threshold: [0, threshold, 0.75, 1] },
    )
  }

  watch(
    target,
    (el, prevEl) => {
      if (prevEl) observer?.unobserve(prevEl)
      if (el && !done) observer?.observe(el)
    },
    { flush: 'post' },
  )

  onBeforeUnmount(teardown)

  return { target }
}
