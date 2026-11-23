// app/composables/useLessonWhiteboards.ts
//
// Реестр белых досок текущего урока.
// ConstructorLesson предоставляет реестр (provide), а ContentTypes/test.vue
// регистрирует в нём свою Whiteboard (getStrokes). Это позволяет собрать штрихи
// всех досок урока в натуральном порядке: сначала по порядку блоков в уроке
// (registerBlock), затем по порядку регистрации внутри блока.

import { inject, onBeforeUnmount, provide, type InjectionKey } from 'vue'
import type { InkDocument, InkStroke } from '~/types/ink'

export interface WhiteboardHandle {
  /** Штрихи доски: getStrokes() — документ, getStrokes(true) — массив штрихов. */
  getStrokes: (asArray?: boolean) => InkDocument | InkStroke[]
  /**
   * Заменить содержимое доски штрихами (необязательно).
   * Если доска автономна (используется вне урока) — реестра нет,
   * и этот метод не вызывается.
   */
  loadStrokes?: (input: InkDocument | InkStroke[]) => void
  /** Текущая высота доски (CSS px), 0 — доска ещё не отрисована. */
  getHeight?: () => number
  /** Текущая ширина доски (CSS px), 0 — доска ещё не отрисована. */
  getWidth?: () => number
  /**
   * Задать высоту доски из сохранённого прохождения — без эмита 'resize'.
   * false — доска ещё не отрисована (высоту нужно применить позже).
   */
  setHeight?: (height: number) => boolean
  /** Позиция линии «Зона ответа» (px от верхнего края доски). */
  getAnswerSize?: () => number
  setAnswerSize?: (size: number) => void
  /** Отступ полосы «поля тетради» от правого края доски (px). */
  getMarginSize?: () => number
  setMarginSize?: (size: number) => void
  /**
   * Визуальная (контейнерная) высота доски: программная минимальная высота
   * из документа ответа (whiteboard_height, «пол») и последняя сохранённая
   * пользователем при ресайзе высота. Хранится в реестре, а не в самой доске:
   * загрузка ответов перезаписывает props.strokes, и пол должен её пережить.
   */
  visualHeight?: WhiteboardVisualHeight
  /** Пользователь оставил новую высоту — контейнер запоминает её (настройка answerHeight). */
  onSavedHeight?: (height: number) => void
  /**
   * Визуальная высота доски изменилась программно (из прохождения). Реестр
   * вызывает колбэк напрямую: присваивание visualHeight на экземпляре
   * компонента не реактивно, и контейнер не узнал бы о новой высоте.
   */
  onHeightChange?: (height: number) => void
}

export interface WhiteboardVisualHeight {
  /** «Пол» из сохранённого прохождения (whiteboard_height документа). */
  floor?: number
  /** Последняя высота, которую оставил пользователь. */
  saved?: number
}

export interface LessonWhiteboardsRegistry {
  registerBlock: (localId: string) => () => void
  registerWhiteboard: (localId: string, wb: WhiteboardHandle) => void
  unregisterWhiteboard: (wb: WhiteboardHandle) => void
  getWhiteboards: () => WhiteboardHandle[]
  /** Подписка на завершение штриха на любой доске урока. */
  onStrokeComplete: (cb: () => void) => () => void
  /** Уведомить подписчиков, что на доске завершён штрих. */
  notifyStrokeComplete: () => void
  /**
   * Ответы прохождения: по документу штрихов на доску, порядок = порядок блоков.
   * Уже зарегистрированные доски сразу получают свой документ.
   */
  setAnswers: (answers: InkDocument[]) => void
  /**
   * Высоты досок из сохранённого прохождения (необязательно, null — не трогать).
   * Порядок = порядок блоков, как у setAnswers.
   */
  setHeights: (heights: (number | null)[] | null) => void
  /**
   * «Пол» высоты доски из документа ответа: минимальная высота, которую контейнер
   * держит, пока ученик не растянул доску сильнее.
   */
  setFloorHeight: (wb: WhiteboardHandle, height: number) => void
  /** Последняя сохранённая пользователем высота доски (null — не было). */
  getSavedHeight: (wb: WhiteboardHandle) => number | null
  /**
   * Запомнить высоту, оставленную пользователем: в памяти реестра и в настройке
   * блока (handle.onSavedHeight), чтобы она ушла в сохранение вместе с уроком.
   */
  saveHeight: (wb: WhiteboardHandle, height: number) => void
  /**
   * Применить сохранённые высоты всем зарегистрированным доскам по порядку.
   * Высота ставится доске напрямую (setHeight, без эмита 'resize') и
   * запоминается в реестре. Порядок — от первой доски к последней.
   */
  applyHeights: () => void
  /**
   * Отступы «полей тетради» из сохранённого прохождения (null — не трогать).
   * Порядок = порядок блоков, как у setAnswers.
   */
  setMargins: (margins: (number | null)[] | null) => void
}

export const LESSON_WHITEBOARDS_KEY: InjectionKey<LessonWhiteboardsRegistry> =
  Symbol('lesson-whiteboards')

export function createLessonWhiteboardsRegistry(): LessonWhiteboardsRegistry {
  // blockLocalId -> белые доски этого блока (в порядке регистрации)
  const byBlock = new Map<string, WhiteboardHandle[]>()
  // blockLocalId -> порядковый номер блока в уроке
  const blockOrder = new Map<string, number>()
  const strokeListeners = new Set<() => void>()
  // Ответы прохождения и доски, которым они уже применены — чтобы не
  // перезаписывать доску повторно (пользователь мог уже дорисовать).
  let answers: InkDocument[] = []
  const applied = new WeakSet<WhiteboardHandle>()
  let seq = 0

  function applyAnswer(wb: WhiteboardHandle) {
    if (applied.has(wb)) return
    if (typeof wb.loadStrokes !== 'function') return
    const index = getWhiteboards().indexOf(wb)
    const doc = index !== -1 ? answers[index] : undefined
    if (!doc) return
    applied.add(wb)
    wb.loadStrokes(doc)
    // Позиция линии «Зона ответа» лежит в том же документе ответа.
    if (doc.answer_size != null) wb.setAnswerSize?.(doc.answer_size)
    // Там же отступ «полей тетради».
    if (doc.margin_size != null) wb.setMarginSize?.(doc.margin_size)
  }

  function setAnswers(list: InkDocument[]) {
    answers = Array.isArray(list) ? list : []
    if (!answers.length) return
    for (const wb of getWhiteboards()) applyAnswer(wb)
  }

  function onStrokeComplete(cb: () => void): () => void {
    strokeListeners.add(cb)
    return () => { strokeListeners.delete(cb) }
  }

  /** Ставит штрих на доске — уведомляем подписчиков. */
  function notifyStrokeComplete() {
    for (const cb of strokeListeners) cb()
  }

  function registerBlock(localId: string): () => void {
    if (!blockOrder.has(localId)) blockOrder.set(localId, seq++)
    return () => {
      blockOrder.delete(localId)
      byBlock.delete(localId)
    }
  }

  function registerWhiteboard(localId: string, wb: WhiteboardHandle) {
    if (!blockOrder.has(localId)) blockOrder.set(localId, seq++)
    const list = byBlock.get(localId) ?? []
    if (!list.includes(wb)) list.push(wb)
    byBlock.set(localId, list)
    // Ответы могли прийти раньше, чем доска отрисовалась.
    applyAnswer(wb)
  }

  function unregisterWhiteboard(wb: WhiteboardHandle) {
    for (const [localId, list] of byBlock) {
      const idx = list.indexOf(wb)
      if (idx !== -1) {
        list.splice(idx, 1)
        if (list.length === 0) byBlock.delete(localId)
        return
      }
    }
  }

  function getWhiteboards(): WhiteboardHandle[] {
    return [...blockOrder.entries()]
      .sort((a, b) => a[1] - b[1])
      .flatMap(([localId]) => byBlock.get(localId) ?? [])
  }

  // ==================== Высоты досок ====================

  // Высоты из сохранённого экземпляра learn; null — высоту не трогаем.
  let heights: (number | null)[] | null = null

  function setFloorHeight(wb: WhiteboardHandle, height: number) {
    const h = Number(height)
    if (!Number.isFinite(h) || h <= 0) return
    wb.visualHeight = { ...wb.visualHeight, floor: h }
    wb.onHeightChange?.(h)
  }

  function getSavedHeight(wb: WhiteboardHandle): number | null {
    const saved = Number(wb.visualHeight?.saved)
    return Number.isFinite(saved) && saved > 0 ? saved : null
  }

  function saveHeight(wb: WhiteboardHandle, height: number) {
    const h = Number(height)
    if (!Number.isFinite(h) || h <= 0) return
    wb.visualHeight = { ...wb.visualHeight, saved: h }
    wb.onSavedHeight?.(h)
    wb.onHeightChange?.(h)
  }

  // Высота из экземпляра learn по индексу доски (порядок = порядок блоков).
  function learnHeightOf(wb: WhiteboardHandle): number | null {
    if (!heights) return null
    const height = Number(heights[getWhiteboards().indexOf(wb)])
    return Number.isFinite(height) && height > 0 ? height : null
  }

  function setHeights(list: (number | null)[] | null) {
    heights = Array.isArray(list) && list.length ? list : null
    applyHeights()
  }

  // Ставит высоту из learn-экземпляра доске напрямую (setHeight не эмитит
  // 'resize') и запоминает её как пол. Порядок — как у getWhiteboards().
  // Скрытый контейнер (например, во вкладке) не отрисуется — ok будет false,
  // а колбэк получит высоту в любом случае, чтобы контейнер дорос вместе с доской.
  function applyHeights() {
    for (const wb of getWhiteboards()) {
      const height = learnHeightOf(wb)
      if (height == null || typeof wb.setHeight !== 'function') continue
      const ok = wb.setHeight(height)
      if (!ok) {
        // Доска не смонтирована: пол всё равно запоминаем — дорисуется позже.
        wb.visualHeight = { ...wb.visualHeight, floor: height }
        wb.onHeightChange?.(height)
        continue
      }
      wb.visualHeight = { ...wb.visualHeight, floor: height }
      wb.onHeightChange?.(height)
    }
  }

  // ==================== Поля тетради ====================

  // Отступы из документа ответа (margin_size); null — не трогаем.
  let margins: (number | null)[] | null = null

  function applyMargins() {
    if (!margins) return
    const boards = getWhiteboards()
    boards.forEach((wb, i) => {
      const size = Number(margins![i])
      if (Number.isFinite(size)) wb.setMarginSize?.(size)
    })
  }

  function setMargins(list: (number | null)[] | null) {
    margins = Array.isArray(list) && list.length ? list : null
    applyMargins()
  }

  return {
    registerBlock,
    // Высота могла прийти раньше, чем доска отрисовалась.
    registerWhiteboard: (localId, wb) => {
      registerWhiteboard(localId, wb)
      applyHeights()
      applyMargins()
    },
    unregisterWhiteboard,
    getWhiteboards,
    onStrokeComplete,
    notifyStrokeComplete,
    setAnswers,
    setHeights,
    setFloorHeight,
    getSavedHeight,
    saveHeight,
    applyHeights,
    setMargins
  }
}

/** Реестр в ConstructorLesson: создаёт свой и отдаёт потомкам. */
export function provideLessonWhiteboards(): LessonWhiteboardsRegistry {
  const registry = createLessonWhiteboardsRegistry()
  provide(LESSON_WHITEBOARDS_KEY, registry)
  return registry
}

/** Подключение блока к реестру (BlockRenderer). */
export function useLessonWhiteboardBlock(localId: () => string | null | undefined) {
  const registry = inject(LESSON_WHITEBOARDS_KEY, null)

  let unregister: (() => void) | null = null

  const sync = () => {
    const id = localId()
    unregister?.()
    unregister = id && registry ? registry.registerBlock(id) : null
  }

  onBeforeUnmount(() => unregister?.())
  return { registry, sync }
}

/** Регистрация конкретной Whiteboard (ContentTypes/test.vue). */
export function useLessonWhiteboard(localId: () => string | null | undefined) {
  const registry = inject(LESSON_WHITEBOARDS_KEY, null)
  return {
    registry,
    register(wb: WhiteboardHandle) {
      const id = localId()
      if (!registry || !id) return
      // Повторная регистрация с новым localId не должна оставлять доску в старом блоке.
      registry.unregisterWhiteboard(wb)
      registry.registerWhiteboard(id, wb)
    },
    unregister(wb: WhiteboardHandle) {
      registry?.unregisterWhiteboard(wb)
    },
    /** Запомнить высоту, оставленную пользователем (в реестре и в настройке). */
    saveHeight(wb: WhiteboardHandle, height: number) {
      registry?.saveHeight(wb, height)
    }
  }
}
