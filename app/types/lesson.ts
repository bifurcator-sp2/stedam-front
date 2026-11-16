// app/types/lesson.ts

import type { SettingNode } from '~/utils/constructors'

// ==================== Урок ====================

export interface LessonTypeOption {
  id: number
  code: string
  title: string
  description: string | null
  color: string | null
  sort: number
}

export interface LessonModel {
  id: number | null
  title: string
  description: string
  locale: string
  type: string | null
  saved: boolean
  published: boolean
  taxonomy_ids: number[] | null
  complexity?: number | null      // ← добавлено
  blocks: LessonBlockModel[]
}

// ==================== Блок урока ====================

export interface LessonBlockModel {
  localId: string
  id: number
  blockId: number | null
  blockTypeCode: string
  settings: SettingNode | null
  images: any[]
  files: any[]
  userId?: number | null
  isTest?: boolean
  complexity?: number | null      // ← добавлено (пригодится позже)
}

// ==================== Источник для drag ====================

export interface DraggedBlockSource {
  type?: BlockStructItem
  block?: BlockStructBlock
  isCollectionTask?: boolean
}

// ==================== Структура /block-types/struct ====================

export interface BlockStructBlock {
  id: number
  block_type_code: string | null
  block_type_name?: string | null
  block_type_icon?: string | null
  default_settings: SettingNode | null
  title: string | null
  description: string | null
  settings: SettingNode | null
  images?: any[]
  files?: any[]
  is_test?: boolean
}

export interface BlockStructItem {
  id: number
  parent_id?: number | null
  code: string
  type: string
  name: string
  description: string | null
  default_settings: SettingNode | null
  blocks_count: number
  blocks: BlockStructBlock[]
  children?: BlockStructItem[]
}

// ==================== API: ответ ====================

export interface LessonResponse {
  id: number
  title: string | null
  description: string | null
  locale: string
  type?: string | null
  saved: boolean
  published: boolean
  taxonomy_ids: number[] | null
  complexity?: number | null      // ← добавлено
  lesson_types?: LessonTypeOption[]
  blocks: LessonBlockResponse[]
}

export interface LessonBlockResponse {
  id: number
  block_id: number | null
  block_type_code: string | null
  settings: SettingNode | null
  images: any[] | null
  files: any[] | null
  order: number
  is_test?: boolean
  user_id?: number | null
  complexity?: number | null      // ← добавлено
}

// ==================== API: payload для save ====================

export interface LessonSavePayload {
  title: string
  description: string
  locale: string
  type: string | null
  saved: boolean
  published: boolean
  taxonomy_ids: number[] | null
  blocks: LessonBlockSavePayload[]
}

export interface LessonBlockSavePayload {
  id: number
  settings: SettingNode | null
  images: any[]
  files: any[]
  complexity?: number | null      // ← добавлено
}

// ==================== Утилита ====================

export function createEmptyLesson(id: number | null = null): LessonModel {
  return {
    id,
    title: '',
    description: '',
    locale: 'ru',
    type: null,
    saved: false,
    published: false,
    taxonomy_ids: null,
    complexity: null,
    blocks: [],
  }
}

export interface LessonBreadcrumb {
  id: number
  title: string
}

export interface LessonListItem {
  id: number
  title: string | null
  description: string | null
  type?: string | null
  blocks_count: number
  saved: boolean
  published: boolean
  created_at: string | null
  updated_at: string | null
  taxonomy_ids?: number[]
}
export interface LessonsPage {
  data: LessonListItem[]
  lesson_types?: LessonTypeOption[]
  meta: {
    current_page: number
    per_page: number
    has_more_pages: boolean
    from: number | null
    to: number | null
  }
}
