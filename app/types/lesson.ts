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
  // Интервал (в минутах) до урока следующего типа — показывается на стрелке порядка.
  time_gap?: number | null
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
  isProc?: boolean
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

// Роль урока для текущего ученика в списке актуальных уроков
export type ActualLessonScope = 'unassigned' | 'assigned' | 'continue' | 'grades'

export interface ActualLessonScopeMeta {
  color: 'neutral' | 'warning' | 'info' | 'success'
  icon: string
  label: string
  // null — урок уже пройден и оценён, открывать некуда
  href: string | null
}

export const ACTUAL_LESSON_SCOPES: Record<ActualLessonScope, ActualLessonScopeMeta> = {
  unassigned: { color: 'neutral', icon: 'i-lucide-user-plus', label: 'Назначить и приступить', href: '/learn/:id' },
  assigned: { color: 'info', icon: 'i-lucide-book-open', label: 'Начать прохождение', href: '/learn/:id' },
  continue: { color: 'warning', icon: 'i-lucide-circle-play', label: 'Продолжить', href: '/learn/:id' },
  grades: { color: 'success', icon: 'i-lucide-award', label: 'Оценено', href: null },
}

export function resolveActualLessonScopeMeta(
  scope: ActualLessonScope | null | undefined,
  lessonId: number,
): ActualLessonScopeMeta {
  const meta = ACTUAL_LESSON_SCOPES[scope ?? 'unassigned'] ?? ACTUAL_LESSON_SCOPES.unassigned
  return {
    ...meta,
    href: meta.href ? meta.href.replace(':id', String(lessonId)) : null,
  }
}

// Оценка урока (actual_lesson_scope === 'grades')
export interface LessonGrade {
  // 0.0 … 1.0
  grade: number
  status: string
}

// Нормализация 0.0…1.0 в шкалу 0.0…5.0 с округлением до 1 знака.
export function normalizeGradeToRuScale(value: number): number {
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
  return Math.round(v * 50) / 10 // 0.0 … 5.0
}

// Цвет по округлению вверх до целой оценки: 1 — чёрный, 2 — красный,
// 3 — оранжевый, 4 — зелёный, 5 — самый яркий зелёный.
export const RU_GRADE_MARK_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: '#000000',
  2: '#dc2626',
  3: '#f97316',
  4: '#1689a3',
  5: '#00e676',
}

export function gradeMarkColor(mark: number): string {
  const bucket = Math.min(5, Math.max(1, Math.ceil(mark))) as 1 | 2 | 3 | 4 | 5
  return RU_GRADE_MARK_COLORS[bucket]
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
  actual_lesson_scope?: ActualLessonScope | null
  grade?: LessonGrade | null
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
