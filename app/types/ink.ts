/**
 * JSON-модель штрихов Whiteboard.
 * Формат максимально плоский, чтобы его можно было один-в-один
 * смапить в InkML <trace> (x y pressure на точку).
 */

export interface InkPoint {
  /** X в CSS-пикселях холста (как в InkML <trace>). */
  x: number
  /** Y в CSS-пикселях холста. */
  y: number
  /** Нормализованное давление 0..1. */
  pressure: number
}

export interface InkStroke {
  /** Уникальный id штриха (для частичного обновления/ключей). */
  id: string
  /** Метка времени начала штриха (ISO 8601) — можно писать в <annotation>. */
  startedAt: string
  /** Цвет чернил (#rrggbb). Для ластика не применяется. */
  color: string
  /** Толщина пера в CSS-пикселях. */
  size: number
  /** Был ли штрих нарисован ластиком. */
  eraser: boolean
  points: InkPoint[]
}

/** Полезная нагрузка события strokeComplete / пропсы strokes. */
export interface InkDocument {
  /** Версия схемы — на будущее, при изменениях формата. */
  version: 1
  strokes: InkStroke[]
}
