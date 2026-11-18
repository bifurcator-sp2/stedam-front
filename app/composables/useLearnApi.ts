// app/composables/useLearnApi.ts

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
  blocks: LearnSnapshotBlock[]
}

export interface LearnSnapshotResponse {
  learn_id: number
  lesson_snapshot: string
  snapshot_data: LearnSnapshotData | string
}

export interface LearnBeginResponse {
  id?: number
  learn_id?: number
  learn?: number
  data?: LearnBeginResponse
}

export const useLearnApi = () => {
  const api = useApi()

  // Старт прохождения: POST /learn/begin
  // silent: true — API-тосты не показываем, ошибку рисуем сами
  function begin(lessonId: number): Promise<LearnBeginResponse> {
    return api.post<LearnBeginResponse>(
      '/learn/begin',
      { lesson_id: lessonId },
      { silent: true }
    )
  }

  // Снимок прохождения: GET /learn/snapshot/{learn}
  // Через request, а не get: снапшот не должен браться из GET-кэша.
  function snapshot(learnId: number): Promise<LearnSnapshotResponse> {
    return api.request<LearnSnapshotResponse>(
      'GET',
      `/learn/snapshot/${learnId}`,
      { silent: true }
    )
  }

  return { begin, snapshot }
}
