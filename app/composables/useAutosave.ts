// app/composables/useAutosave.ts
//
// Универсальный автосейв с паузой на UI-взаимодействие.
//
// Использование:
//   const { remaining, schedule, cancel, pause, resume } = useAutosave({
//     delaySec: 5,
//     canRun: () => !!lesson.value.id && !busy.value,
//     save: async () => { await saveLesson() },
//     watchSource: () => lesson.value,
//   })

import { onBeforeUnmount, onMounted, ref, watch, type WatchSource } from 'vue'

// ==================== Типы ====================

export interface UseAutosaveOptions {
  /** Задержка в секундах. По умолчанию 5. */
  delaySec?: number

  /**
   * Готов ли автосейв стартовать.
   * Проверяется при каждом планировании и перед самым вызовом save().
   */
  canRun: () => boolean

  /** Функция сохранения. Вызывается по истечении таймера. */
  save: () => Promise<void> | void

  /**
   * Реактивный источник изменений.
   * Любое изменение → schedule(). Обычно `() => model.value` с deep-watch.
   */
  watchSource?: WatchSource | WatchSource[]

  /**
   * Флаг «программное изменение». Если true — watchSource игнорируется.
   * Нужен, чтобы save() и load() не триггерили новый автосейв.
   * Может быть ref или геттер.
   */
  isProgrammatic?: () => boolean

  /**
   * Дополнительные CSS-селекторы попапов/лайтбоксов,
   * которые должны ставить автосейв на паузу.
   */
  extraPopupSelectors?: string[]
}

export interface UseAutosaveReturn {
  /** Секунды до автосейва. null — таймер не идёт. */
  remaining: ReturnType<typeof ref<number | null>>

  /** Запланировать автосейв (перезапускает таймер). */
  schedule: () => void

  /** Отменить автосейв (без снятия блокировок). */
  cancel: () => void

  /** Поставить на паузу (счётчик блокировок +1). */
  pause: () => void

  /** Снять паузу (счётчик блокировок -1). */
  resume: () => void

  /** Сколько активных блокировок сейчас. */
  locks: ReturnType<typeof ref<number>>
}

// ==================== Селекторы попапов по умолчанию ====================

const DEFAULT_POPUP_SELECTORS = [
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="tooltip"]',
  '[data-headlessui-state]',
  '[data-popover]',
  '[data-lightbox]',
  '[data-autosave-pause]',
]

// ==================== Хелпер: editable-элемент ====================

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (el.isContentEditable) return true
  return false
}

// ==================== Composable ====================

export function useAutosave(options: UseAutosaveOptions): UseAutosaveReturn {
  const {
    delaySec = 5,
    canRun,
    save,
    watchSource,
    isProgrammatic,
    extraPopupSelectors = [],
  } = options

  // ==================== Состояние ====================

  const remaining = ref<number | null>(null)
  const locks = ref(0)

  let timer: ReturnType<typeof setTimeout> | null = null
  let tick: ReturnType<typeof setInterval> | null = null

  // Флаги блокировок (чтобы не плодить +1 на каждое событие)
  let focusLockActive = false
  let popupLockCount = 0

  // ==================== Таймеры ====================

  function clearTimers() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (tick) {
      clearInterval(tick)
      tick = null
    }
    remaining.value = null
  }

  function schedule() {
    if (!canRun() || locks.value > 0) {
      clearTimers()
      return
    }

    clearTimers()

    remaining.value = delaySec

    tick = setInterval(() => {
      if (remaining.value !== null && remaining.value > 0) {
        remaining.value -= 1
      }
    }, 1000)

    timer = setTimeout(async () => {
      clearTimers()
      if (!canRun() || locks.value > 0) return
      await save()
    }, delaySec * 1000)
  }

  function cancel() {
    clearTimers()
  }

  function pause() {
    locks.value += 1
    clearTimers()
  }

  function resume() {
    locks.value = Math.max(0, locks.value - 1)
    if (locks.value === 0 && canRun()) {
      schedule()
    }
  }

  // ==================== Фокус в инпутах ====================

  function onFocusIn(e: FocusEvent) {
    if (!isEditableTarget(e.target)) return
    if (focusLockActive) return
    focusLockActive = true
    pause()
  }

  function onFocusOut(e: FocusEvent) {
    if (!isEditableTarget(e.target)) return
    const next = e.relatedTarget as HTMLElement | null
    if (next && isEditableTarget(next)) return

    if (focusLockActive) {
      focusLockActive = false
      resume()
    }
  }

  // ==================== Попапы через MutationObserver ====================

  const POPUP_SELECTOR = [
    ...DEFAULT_POPUP_SELECTORS,
    ...extraPopupSelectors,
  ].join(',')

  let popupObserver: MutationObserver | null = null

  function countVisiblePopups(): number {
    if (!import.meta.client) return 0
    const els = document.querySelectorAll(POPUP_SELECTOR)
    let count = 0
    els.forEach((el) => {
      const htmlEl = el as HTMLElement
      if (htmlEl.offsetParent !== null || htmlEl.getClientRects().length > 0) {
        count += 1
      }
    })
    return count
  }

  let syncScheduled = false
  function scheduleSync() {
    if (syncScheduled) return
    syncScheduled = true
    requestAnimationFrame(() => {
      syncScheduled = false
      syncPopups()
    })
  }

  function syncPopups() {
    const next = countVisiblePopups()
    const delta = next - popupLockCount
    popupLockCount = next

    if (delta > 0) {
      for (let i = 0; i < delta; i++) pause()
    } else if (delta < 0) {
      for (let i = 0; i < -delta; i++) resume()
    }
  }

  function startPopupObserver() {
    if (!import.meta.client) return

    popupObserver = new MutationObserver(() => {
      scheduleSync()
    })

    popupObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'],
    })

    syncPopups()
  }

  // ==================== Watch источника ====================

  if (watchSource) {
    watch(
      watchSource,
      () => {
        if (isProgrammatic?.()) return
        if (locks.value > 0) return
        if (!canRun()) return
        schedule()
      },
      { deep: true },
    )
  }

  // ==================== Lifecycle ====================

  onMounted(() => {
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    startPopupObserver()
  })

  onBeforeUnmount(() => {
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('focusout', onFocusOut)
    popupObserver?.disconnect()
    popupObserver = null
    clearTimers()
  })

  // ==================== Экспорт ====================

  return {
    remaining,
    schedule,
    cancel,
    pause,
    resume,
    locks,
  }
}
