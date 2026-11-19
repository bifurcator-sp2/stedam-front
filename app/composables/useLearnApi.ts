// app/composables/useLearnApi.ts

import type { LessonTypeOption } from '~/types/lesson'
import type { InkDocument } from '~/types/ink'
import type { LearnRecord } from '~/composables/useLearnDBcache'

export interface LearnSnapshotNode {
  key: string
  default?: unknown
  public?: boolean
  children?: LearnSnapshotNode[]
}

export interface LearnSnapshotBlock {
  id: number
  code: string | null
  order: number
  is_proc: boolean
  resolver_path: string | null
  complexity: number | null
  settings: LearnSnapshotNode | LearnSnapshotNode[] | null
}

export interface LearnSnapshotData {
  lesson_id: number
  title: string | null
  locale: string
  // Метаданные урока, которые контроллер подмешивает в снапшот
  // (в самом снимке их нет — см. LearnSnapshotData::snapshotDataArray).
  type: string | null
  complexity: number | null
  taxonomy_ids: number[] | null
  lesson_types: LessonTypeOption[]
  blocks: LearnSnapshotBlock[]
}

export interface LearnSnapshotResponse {
  learn_id: number
  lesson_snapshot: string
  snapshot_data: LearnSnapshotData | string
}

export interface LearnSaveResponse {
  learn_id: number
  saved: boolean
}

export interface LearnBeginResponse {
  id?: number
  learn_id?: number
  learn?: number
  data?: LearnBeginResponse
}

// "1:1 как отдал сервер": если пришла JSON-строка — храним её как есть,
// иначе склеиваем в строку через JSON.stringify.
function serializeSnapshotData(
  data: LearnSnapshotData | string,
): LearnSnapshotData | string {
  return typeof data === 'string' ? data : JSON.stringify(data)
}

export const useLearnApi = () => {
  // api понадобится снова, когда включим запрос /learn/save.
  // eslint-disable-next-line unused-imports/no-unused-vars
  const api = useApi()
  const dbCache = useLearnDBcache()

  function currentUserId(): number | null {
    const { user } = useSanctumAuth<{ id: number }>()
    return user.value?.id ?? null
  }

  // Старт прохождения: POST /learn/begin
  // Та же схема, что и у snapshot(): сначала ищем запись в IndexedDB
  // (user_id + lesson_id), и только при промахе идём на сервер,
  // сохраняем ответ 1:1 и после этого отдаём результат.
  // refresh: true — принудительно обновить с сервера (минуя кэш).
  // silent: true — API-тосты не показываем, ошибку рисуем сами
  async function begin(
    lessonId: number,
    options: { refresh?: boolean } = {},
  ): Promise<LearnBeginResponse> {
    const userId = currentUserId()

    if (userId !== null && !options.refresh) {
      const cached = await dbCache.getLearn(userId, lessonId)
      if (cached) return cached
    }

    const response = await api.post<LearnBeginResponse>(
      '/learn/begin',
      { lesson_id: lessonId },
      { silent: true }
    )

    const learnId = response?.learn_id ?? response?.learn ?? response?.id
    if (userId !== null && learnId != null) {
      await dbCache.putLearn({
        ...response,
        id: learnId,
        user_id: userId,
      } as LearnRecord)
    }

    return response
  }

  // Снимок прохождения: GET /learn/snapshot/{learn}
  // Сначала смотрим в IndexedDB (user_id + learn_id), и только при промахе
  // ходим на сервер, сохраняем запись и после этого отдаём результат.
  // refresh: true — принудительно обновить с сервера (минуя кэш).
  async function snapshot(
    learnId: number,
    options: { refresh?: boolean } = {},
  ): Promise<LearnSnapshotResponse> {
    const userId = currentUserId()

    if (userId !== null && !options.refresh) {
      const cached = await dbCache.getSnapshot(userId, learnId)
      if (cached) {
        return {
          learn_id: cached.learn_id,
          lesson_snapshot: cached.snapshot,
          snapshot_data: cached.snapshot_data,
        }
      }
    }

    // Через request, а не get: снапшот не должен браться из GET-кэша.
    const response = await api.request<LearnSnapshotResponse>(
      'GET',
      `/learn/snapshot/${learnId}`,
      { silent: true }
    )

    const snapshotData = serializeSnapshotData(response.snapshot_data)
    const lessonId = typeof response.snapshot_data === 'object' && response.snapshot_data !== null
      ? response.snapshot_data.lesson_id
      : undefined

    if (userId !== null && lessonId != null) {
      await dbCache.putSnapshot({
        user_id: userId,
        lesson_id: lessonId,
        learn_id: response.learn_id ?? learnId,
        snapshot: response.lesson_snapshot,
        snapshot_data: snapshotData,
      })
    }

    return {
      ...response,
      snapshot_data: snapshotData,
    }
  }

  // Сохранение прохождения: POST /learn/save
  // answers — документы штрихов белых досок урока в порядке блоков
  // (индекс массива = порядок доски в уроке).
  // whiteboardHeights — высоты досок ответов (px) в том же порядке, что и answers.
  // В сохраняемый документ высота попадает рядом со strokes: answers[i].whiteboard_height
  // (null — высота неизвестна).
  // silent: true — только локальный кэш (IndexedDB), без запроса на сервер.
  async function saveLearn(
    learnId: number,
    answers: InkDocument[],
    silent = false,
    whiteboardHeights: (number | null)[] = [],
  ): Promise<LearnSaveResponse> {
    const payload = answers.map((doc, i) => ({
      ...doc,
      whiteboard_height: whiteboardHeights[i] ?? null,
    }))

    // Сначала локальный кэш (таблица learns).
    const userId = currentUserId()
    if (userId !== null) {
      await dbCache.updateLearnAnswers(userId, learnId, payload)
    }

    // silent — на сервер не отправляем.
    if (silent) {
      return { learn_id: learnId, saved: true }
    }


     const response = await api.patch<LearnSaveResponse>(
       '/learn/save',
       { learn_id: learnId, answers: payload },
       { silent: false },
     )

    // return { ...response, learn_id: learnId, saved: response?.saved ?? true }
    return { learn_id: learnId, saved: true }
  }

  // Ответы прохождения из локального кэша (таблица learns, ключ [user_id, id]).
  async function getAnswers(userId: number, learnId: number): Promise<unknown[]> {
    return dbCache.getAnswers(userId, learnId)
  }

  return { begin, snapshot, saveLearn, getAnswers }
}
