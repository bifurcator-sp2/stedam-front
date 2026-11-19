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
}

export interface LessonWhiteboardsRegistry {
  registerBlock: (localId: string) => () => void
  registerWhiteboard: (localId: string, wb: WhiteboardHandle) => void
  unregisterWhiteboard: (wb: WhiteboardHandle) => void
  getWhiteboards: () => WhiteboardHandle[]
  /**
   * Высоты досок ответов (px) в порядке блоков, как у getWhiteboards().
   * Доски без известной высоты дают null — порядок при этом сохраняется.
   */
  getWhiteboardHeights: () => (number | null)[]
  /** Высота доски блока (px). null — блок доски ответов не отдал высоту. */
  setWhiteboardHeight: (localId: string, height: number | null) => void
  /** Подписка на завершение штриха на любой доске урока. */
  onStrokeComplete: (cb: () => void) => () => void
  /** Уведомить подписчиков, что на доске завершён штрих. */
  notifyStrokeComplete: () => void
  /**
   * Ответы прохождения: по документу штрихов на доску, порядок = порядок блоков.
   * Уже зарегистрированные доски сразу получают свой документ.
   */
  setAnswers: (answers: InkDocument[]) => void
}

export const LESSON_WHITEBOARDS_KEY: InjectionKey<LessonWhiteboardsRegistry> =
  Symbol('lesson-whiteboards')

export function createLessonWhiteboardsRegistry(): LessonWhiteboardsRegistry {
  // blockLocalId -> белые доски этого блока (в порядке регистрации)
  const byBlock = new Map<string, WhiteboardHandle[]>()
  // blockLocalId -> порядковый номер блока в уроке
  const blockOrder = new Map<string, number>()
  // blockLocalId -> высота доски ответа (px), если блок её сообщил
  const heights = new Map<string, number>()
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
      heights.delete(localId)
    }
  }

  function setWhiteboardHeight(localId: string, height: number | null) {
    if (height != null && Number.isFinite(height) && height > 0) {
      heights.set(localId, Math.round(height))
    } else {
      heights.delete(localId)
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

  // Индекс высоты берётся по номеру блока, а не по номеру доски: доска без
  // высоты не сдвигает высоты следующих досок.
  function getWhiteboardHeights(): (number | null)[] {
    return [...blockOrder.entries()]
      .sort((a, b) => a[1] - b[1])
      .filter(([localId]) => (byBlock.get(localId)?.length ?? 0) > 0)
      .flatMap(([localId]) =>
        (byBlock.get(localId) ?? []).map(() => heights.get(localId) ?? null),
      )
  }

  return {
    registerBlock,
    registerWhiteboard,
    unregisterWhiteboard,
    getWhiteboards,
    getWhiteboardHeights,
    setWhiteboardHeight,
    onStrokeComplete,
    notifyStrokeComplete,
    setAnswers,
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
      if (registry && id) registry.registerWhiteboard(id, wb)
    },
    unregister(wb: WhiteboardHandle) {
      registry?.unregisterWhiteboard(wb)
    },
  }
}
