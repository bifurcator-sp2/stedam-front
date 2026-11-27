// app/utils/lessonType.ts
// Визуальная идентификация типа урока (home_work, class_work, …):
// контур, заливка и бейдж. Цвет берётся из LessonTypeOption.color (цвет
// справочника уроков — единственный источник правды); если он не задан —
// фолбэк из LESSON_TYPE_COLORS по коду типа.

import type { LessonTypeOption } from '~/types/lesson'

export interface LessonTypePalette {
  raw: string
  // Контур карточки / бейджа
  border: string
  // Лёгкая заливка карточки
  background: string
  // Цвет иконки бейджа
  badge: string
}

// Фолбэк-цвета, когда LessonTypeOption.color не заполнен
export const LESSON_TYPE_COLORS: Record<string, string> = {
  home_work: '#2563eb', // синий — домашняя работа
  class_work: '#7c3aed', // фиолетовый — классная работа
  test: '#dc2626',      // красный — контрольная
  practice: '#059669',  // зелёный — практика
}

// "#f00", "f00", "#ff0000", "red", "rgb(...)" → валидная CSS-строка или null
export function normalizeLessonColor(raw: string | null | undefined): string | null {
  const c = (raw ?? '').trim()
  if (!c) return null
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c)) return c
  if (/^([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c)) return `#${c}`
  return c
}

export function lessonTypeColor(type: LessonTypeOption | null | undefined): string | null {
  const own = normalizeLessonColor(type?.color)
  if (own) return own
  const code = type?.code?.trim()
  return code ? normalizeLessonColor(LESSON_TYPE_COLORS[code]) : null
}

// Палитра типа урока: контур, заливка и бейдж из одного цвета
export function lessonTypePalette(type: LessonTypeOption | null | undefined): LessonTypePalette | null {
  const raw = lessonTypeColor(type)
  if (!raw) return null
  return {
    raw,
    border: raw,
    background: `${raw}1a`, // ~10% непрозрачности
    badge: raw,
  }
}

// CSS-переменные для контура/заливки: используются через
// border-color: var(--lesson-type-border) на карточке урока.
export function lessonTypeCssVars(type: LessonTypeOption | null | undefined): Record<string, string> | undefined {
  const p = lessonTypePalette(type)
  if (!p) return undefined
  return {
    '--lesson-type-border': p.border,
    '--lesson-type-bg': p.background,
    '--lesson-type-badge': p.badge,
  }
}
