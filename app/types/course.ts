// app/types/course.ts

import type { LessonListItem } from '~/types/lesson'

// ==================== Тема курса ====================

export interface ThemeLesson extends LessonListItem {
  /** Локальный ключ для рендера (если урок ещё не пришёл с бэка). */
  localId: string
  /** Интервал (в минутах) после этого урока внутри темы. */
  time_gap?: number
}

export interface ThemeModel {
  id: number | null
  localId: string
  title: string
  description: string
  lessons: ThemeLesson[]
}

/** Источник внутреннего перетаскивания урока (между темами / внутри темы). */
export interface ThemeLessonDrag {
  themeLocalId: string
  lessonLocalId: string
  /** Тип перетаскиваемого урока: соседняя тема не видит уроков темы-источника. */
  type?: string | null
}

// ==================== Элемент листинга ====================

export interface CourseListItem {
  id: number
  user_id: number | null
  is_system: boolean
  title: string
  description: string
  locale: string
  tax_id: number | null
  lessons_count: number | null
  published: boolean
  updated_at: string | null
}

// ==================== API: страница ====================

export interface CoursesPage {
  data: CourseListItem[]
  meta: {
    current_page: number
    per_page: number
    has_more_pages: boolean
    from: number | null
    to: number | null
  }
}
