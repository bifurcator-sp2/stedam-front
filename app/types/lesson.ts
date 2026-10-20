// app/types/lesson.ts

import type { SettingNode } from '~/utils/constructors'

// ==================== Урок ====================

export interface LessonModel {
  id: number | null
  title: string
  description: string
  locale: string
  saved: boolean
  published: boolean
  taxonomy_ids: number[] | null
  blocks: LessonBlockModel[]
}

// ==================== Блок урока ====================

export interface LessonBlockModel {
  localId: string
  id: number
  blockId: number | null
  blockTypeCode: string
  settings: SettingNode[]
  images: any[]
  files: any[]
}

// ==================== Источник для drag ====================

export interface DraggedBlockSource {
  type: BlockStructItem
  block: BlockStructBlock
}

// ==================== Структура /block-types/struct ====================

export interface BlockStructBlock {
  id: number
  block_type_id: number
  /** Код типа блока (добавлено для быстрого доступа без поиска по дереву) */
  block_type_code: string | null
  /** Дефолтные настройки типа блока (добавлено для рендера и drag&drop) */
  default_settings: SettingNode[]
  title: string | null
  description: string | null
  settings: Record<string, any>
  images?: any[]
  files?: any[]
}

export interface BlockStructItem {
  id: number
  /** ID родительского узла (для корневых узлов может быть -1 или null) */
  parent_id?: number | null
  /** Уникальный код узла (например, 'block_index_1' или 'misc') */
  code: string
  /** Тип узла (теперь может быть 'info' для узлов дерева) */
  type: string
  name: string
  description: string | null
  default_settings: SettingNode[]
  blocks_count: number
  blocks: BlockStructBlock[]
  /** Вложенные дочерние узлы (добавлено для поддержки дерева) */
  children?: BlockStructItem[]
}

// ==================== API: ответ ====================

export interface LessonResponse {
  id: number
  title: string | null
  description: string | null
  locale: string
  saved: boolean
  published: boolean
  taxonomy_ids: number[] | null
  blocks: LessonBlockResponse[]
}

export interface LessonBlockResponse {
  id: number
  block_id: number | null
  block_type_code: string | null
  settings: Record<string, any> | null
  images: any[] | null
  files: any[] | null
  order: number
}

// ==================== API: payload для save ====================

export interface LessonSavePayload {
  title: string
  description: string
  locale: string
  saved: boolean
  published: boolean
  taxonomy_ids: number[] | null
  blocks: LessonBlockSavePayload[]
}

export interface LessonBlockSavePayload {
  id: number
  settings: Record<string, any>
  images: any[]
  files: any[]
}

// ==================== Утилита ====================

export function createEmptyLesson(id: number | null = null): LessonModel {
  return {
    id,
    title: '',
    description: '',
    locale: 'ru',
    saved: false,
    published: false,
    taxonomy_ids: null,
    blocks: [],
  }
}
