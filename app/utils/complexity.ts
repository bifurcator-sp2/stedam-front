// app/utils/complexity.ts
//
// Единый источник правды для градации сложности (0..1).
//
// Диапазоны одинаковые (по 0.25) — значение хранится на сервере как float,
// а уровень выбирается только для отображения и редактирования.
//
//   Базовый      : [0.00 .. 0.25]
//   Продвинутый  : (0.25 .. 0.50]
//   Сложный      : (0.50 .. 0.75]
//   Экспертный   : (0.75 .. 1.00]

export type ComplexityLevelKey = 'basic' | 'advanced' | 'complex' | 'expert'

export interface ComplexityLevel {
  key: ComplexityLevelKey
  label: string
  /** Нижняя граница (не включается, кроме первого уровня) */
  min: number
  /** Верхняя граница (включается) */
  max: number
  /** Иконка @nuxt/icon (коллекция lucide) */
  icon: string
  /** HEX — для инлайновых стилей (градиент слайдера, progress) */
  hex: string
  /** Цвет иконки/текста (адаптирован под тёмную тему) */
  text: string
  /** Фон + текст + граница — для бейджей */
  badge: string
  /** Цвет левой границы карточки */
  border: string
  /** Цвет границы при hover */
  borderHover: string
  /** CSS-переменная цвета прогресса */
  progress: string
}

/** Шагов в полном диапазоне слайдера — как у уровней 1..50 */
export const MAX_COMPLEXITY_N = 50

export const COMPLEXITY_LEVELS: readonly ComplexityLevel[] = [
  {
    key: 'basic',
    label: 'Базовый',
    min: 0,
    max: 0.25,
    icon: 'i-lucide-book-open',
    hex: '#10b981',
    text: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
    border: 'border-emerald-500/40',
    borderHover: 'hover:border-emerald-500',
    progress: 'var(--ui-success)'
  },
  {
    key: 'advanced',
    label: 'Продвинутый',
    min: 0.25,
    max: 0.5,
    icon: 'i-lucide-zap',
    hex: '#f59e0b',
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
    border: 'border-amber-500/40',
    borderHover: 'hover:border-amber-500',
    progress: 'var(--ui-warning)'
  },
  {
    key: 'complex',
    label: 'Сложный',
    min: 0.5,
    max: 0.75,
    icon: 'i-lucide-trophy',
    hex: '#f43f5e',
    text: 'text-rose-600 dark:text-rose-400',
    badge: 'bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400',
    border: 'border-rose-500/40',
    borderHover: 'hover:border-rose-500',
    progress: 'var(--ui-error)'
  },
  {
    key: 'expert',
    label: 'Экспертный',
    min: 0.75,
    max: 1,
    icon: 'i-lucide-gem',
    hex: '#18181b',
    // Чёрный на тёмном фоне не виден — инвертируем только в dark
    text: 'text-zinc-900 dark:text-zinc-100',
    badge: 'bg-zinc-900/10 text-zinc-900 border-zinc-900/30 dark:bg-zinc-100/10 dark:text-zinc-100 dark:border-zinc-100/30',
    border: 'border-zinc-900/40 dark:border-zinc-100/40',
    borderHover: 'hover:border-zinc-900 dark:hover:border-zinc-100',
    progress: 'var(--ui-text-highlighted)'
  }
] as const

/** Приводит произвольное значение сложности к диапазону 0..1 */
export function clampComplexity(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(Number(value))) return 0
  return Math.max(0, Math.min(1, Number(value)))
}

/**
 * Уровень сложности для значения 0..1.
 * null/undefined/NaN/отрицательные — «Базовый».
 */
export function complexityLevel(value: number | null | undefined): ComplexityLevel {
  const v = clampComplexity(value)

  for (const level of COMPLEXITY_LEVELS) {
    if (v <= level.max) return level
  }

  return COMPLEXITY_LEVELS[COMPLEXITY_LEVELS.length - 1]
}

/** Индекс уровня в COMPLEXITY_LEVELS */
export function complexityLevelIndex(value: number | null | undefined): number {
  const level = complexityLevel(value)
  return COMPLEXITY_LEVELS.indexOf(level)
}

/** Значение 0..1 → позиция слайдера 1..MAX_COMPLEXITY_N */
export function complexitySliderValue(value: number | null | undefined): number {
  const v = clampComplexity(value)
  return Math.max(1, Math.min(MAX_COMPLEXITY_N, Math.round(v * MAX_COMPLEXITY_N)))
}

/** Позиция слайдера 1..MAX_COMPLEXITY_N → значение 0..1 */
export function complexityFromSlider(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(Number(n))) return 0
  const clamped = Math.max(1, Math.min(MAX_COMPLEXITY_N, Math.round(Number(n))))
  return +(clamped / MAX_COMPLEXITY_N).toFixed(3)
}
