<!-- components/Education/Whiteboard/Whiteboard.vue -->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useProfile } from '~/composables/useProfile'
import type { InkDocument, InkStroke } from '~/types/ink'

// Тип настроек
interface InkSettings {
  penSize?: number
  eraserSize?: number
  bg?: 'none' | 'lined' | 'grid' | 'dots'
  bgOpacity?: number
  bgScale?: number
  bgColor?: string
  pressureEnabled?: boolean
  minPressureWidth?: number
  maxPressureWidth?: number
  smoothingEnabled?: boolean
  stabilizer?: number
}

const INK_DEFAULTS: Required<InkSettings> = {
  penSize: 3,
  eraserSize: 30,
  bg: 'none',
  bgOpacity: 1,
  bgScale: 1,
  bgColor: '#d1d5db',
  pressureEnabled: true,
  minPressureWidth: 0.5,
  maxPressureWidth: 2,
  smoothingEnabled: true,
  stabilizer: 0,
}

const props = withDefaults(defineProps<{
  settings?: InkSettings
  color?: string
  hideToolbar?: boolean
  /**
   * Внешние штрихи (JSON). При монтировании доска ими заполняется, а при
   * изменении массива — сверяется: новые добавляются, удалённые убираются.
   * Штрихи, нарисованные пользователем, в пропсу не пишутся (без двусторонней привязки).
   */
  strokes?: InkDocument | InkStroke[]
  /**
   * Показывать ручку под нижней границей: тягание меняет высоту доски
   * (контейнер `position: relative` получает inline height).
   */
  resizable?: boolean
  /** Минимальная высота при ресайзе, px. */
  minHeight?: number
  /**
   * Показывать линию «Зона ответа» — горизонтальную полосу, которую можно
   * тянуть вверх-вниз. Её позиция живёт в модели answerSize (v-model).
   */
  answerZone?: boolean
}>(), {
  color: '#000000',
  hideToolbar: false,
  strokes: undefined,
  resizable: false,
  minHeight: 120,
  answerZone: false,
})

// Позиция линии «Зона ответа»: расстояние (px) от верхнего края доски.
// Двусторонняя модель (v-model:answer-size) — доступна родителю.
const answerSize = defineModel<number>('answerSize', { default: 75 })

// Сколько пикселей от верхнего края доски линия не может пересечь.
const ANSWER_SIZE_MIN = 0

// События
const emit = defineEmits<{
  (e: 'stroke-end', strokes: Stroke[]): void
  /** ★ Штрих завершён. Отдаёт весь документ в InkML-совместимом JSON. */
  (e: 'strokeComplete', doc: InkDocument): void
  // ★ Новое событие для управления паузой ИИ-инференса
  (e: 'interaction', active: boolean): void
  /** Высота доски изменилась перетаскиванием ручки. */
  (e: 'resize', height: number): void
  /**
   * Высота меняется прямо во время жеста. Нужна подписчикам, которые держат
   * доску в контейнере фиксированной высоты (overflow-hidden): без живой
   * высоты контейнер обрезал бы растущую доску до отпускания ручки.
   */
  (e: 'resizeMove', height: number): void
  /** Линию «Зона ответа» перетащили: новое расстояние от верхнего края, px. */
  (e: 'answerSizeChange', size: number): void
}>()

const { userData } = useProfile()

const effectiveSettings = computed<Required<InkSettings>>(() => {
  const source = (props.settings
    ?? (userData.value?.settings?.ink as InkSettings | undefined)
    ?? {}) as Partial<InkSettings>
  return { ...INK_DEFAULTS, ...source }
})

const currentMode = ref<'pen' | 'eraser'>('pen')
const currentPenSize = computed(() => effectiveSettings.value.penSize)
const currentEraserSize = computed(() => effectiveSettings.value.eraserSize)
const pressureEnabled = computed(() => effectiveSettings.value.pressureEnabled)
const minPressureWidth = computed(() => effectiveSettings.value.minPressureWidth)
const maxPressureWidth = computed(() => effectiveSettings.value.maxPressureWidth)
const smoothingEnabled = computed(() => effectiveSettings.value.smoothingEnabled)
const stabilizerStrength = computed(() => effectiveSettings.value.stabilizer)

const currentBg = computed(() => effectiveSettings.value.bg)
const bgOpacity = computed(() => effectiveSettings.value.bgOpacity)
const bgScale = computed(() => effectiveSettings.value.bgScale)
const bgColor = computed(() => effectiveSettings.value.bgColor)

// ==================== Стили фона ====================
const bgStyle = computed(() => {
  if (currentBg.value === 'none') return { display: 'none' }

  const size = Math.max(12, 32 * bgScale.value)
  const color = bgColor.value

  let backgroundImage = ''
  let backgroundSize = 'auto'

  if (currentBg.value === 'lined') {
    backgroundImage = `repeating-linear-gradient(to bottom, transparent, transparent ${size - 1}px, ${color} ${size - 1}px, ${color} ${size}px)`
  } else if (currentBg.value === 'grid') {
    backgroundImage = `repeating-linear-gradient(to bottom, transparent, transparent ${size - 1}px, ${color} ${size - 1}px, ${color} ${size}px), repeating-linear-gradient(to right, transparent, transparent ${size - 1}px, ${color} ${size - 1}px, ${color} ${size}px)`
  } else if (currentBg.value === 'dots') {
    const dotRadius = Math.max(1, size / 24)
    backgroundImage = `radial-gradient(circle, ${color} ${dotRadius}px, transparent ${dotRadius}px)`
    backgroundSize = `${size}px ${size}px`
  }

  return {
    backgroundImage,
    backgroundSize,
    opacity: bgOpacity.value,
  }
})

// ==================== Модель штрихов ====================
interface StrokePoint {
  x: number
  y: number
  pressure: number
  isPen: boolean
}

interface Stroke {
  id: string
  startedAt: string
  points: StrokePoint[]
  color: string
  size: number
  eraser: boolean
  smooth: boolean
  usePressure: boolean
  minPw: number
  maxPw: number
  stabilizer: number
}

// ==================== Сериализация (JSON ↔ модель) ====================
let strokeSeq = 0

function newStrokeId(): string {
  strokeSeq += 1
  return `s${Date.now().toString(36)}_${strokeSeq.toString(36)}`
}

function serializeStrokes(): InkDocument {
  return {
    version: 1,
    ...(props.answerZone ? { answer_size: answerSize.value } : {}),
    strokes: strokes.map(s => ({
      id: s.id,
      startedAt: s.startedAt,
      color: s.color,
      size: s.size,
      eraser: s.eraser,
      points: s.points.map(p => ({
        x: round2(p.x),
        y: round2(p.y),
        pressure: Math.round(Math.max(0, Math.min(1, p.pressure ?? 0.5)) * 1000) / 1000,
      })),
    })),
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function deserializeStroke(input: InkStroke, settings: Required<InkSettings>): Stroke {
  const rawPoints = input.points ?? []
  // Из JSON тип пера неизвестен — давление учитываем, только если оно реально меняется
  const hasPressure = rawPoints.some(q => q.pressure !== 0.5)

  const points = rawPoints
    .filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))
    .map(p => ({
      x: p.x,
      y: p.y,
      pressure: Number.isFinite(p.pressure) ? p.pressure : 0.5,
      isPen: hasPressure,
    }))

  return {
    id: input.id || newStrokeId(),
    startedAt: input.startedAt || new Date().toISOString(),
    points,
    color: input.color ?? props.color,
    size: input.size > 0 ? input.size : settings.penSize,
    eraser: Boolean(input.eraser),
    smooth: settings.smoothingEnabled,
    usePressure: settings.pressureEnabled,
    minPw: settings.minPressureWidth,
    maxPw: settings.maxPressureWidth,
    stabilizer: 0, // стабилизатор — только для живого ввода
  }
}

function extractInkStrokes(input: InkDocument | InkStroke[] | undefined): InkStroke[] {
  if (!input) return []
  if (Array.isArray(input)) return input
  return Array.isArray(input.strokes) ? input.strokes : []
}

const strokes: Stroke[] = []
const redoStack: Stroke[] = []
// Реактивные счётчики — сами массивы не наблюдаются Vue, поэтому кнопки undo/redo
// ориентируются на эти значения.
const strokeCount = ref(0)
const redoCount = ref(0)

function syncCounters() {
  strokeCount.value = strokes.length
  redoCount.value = redoStack.length
}

// ==================== Состояние канвы ====================
const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

let ctx: CanvasRenderingContext2D | null = null
let resizeObserver: ResizeObserver | null = null
let dpr = 1

let drawing = false
let currentStroke: Stroke | null = null
let lastMid: { x: number; y: number } | null = null
let currentPointerId: number | null = null
let currentIsErasing = false
let stabilizerState: { x: number; y: number } | null = null

const cursorPos = ref({ x: -100, y: -100 })
const showEraserCursor = ref(false)
const isPointerInside = ref(false)
const isCtrlPressed = ref(false)

// ==================== Режим перемещения штрихов ====================
// В этом режиме рисования нет: указатель либо тянет выделенные штрихи, либо
// выделяет их рамкой. Режим включается кнопкой тулбара и выключается ей же или
// двойным кликом по пустому месту.
const moveMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
// Рамка выделения в координатах холста (CSS-пиксели); null — рамки нет.
const marquee = ref<{ left: number; top: number; width: number; height: number } | null>(null)
// Жест в режиме перемещения: null — указатель ничего не держит.
let moveGesture:
  | { kind: 'marquee' | 'drag', pointerId: number, startX: number, startY: number }
  | null = null
// Сдвиг, уже применённый к выделенным штрихам текущим жестом (px).
let moveApplied = { x: 0, y: 0 }

const selectedCount = computed(() => selectedIds.value.size)

// ★ Логика управления состоянием взаимодействия (для паузы ИИ)
let interactionActive = false
function setInteraction(active: boolean) {
  if (interactionActive === active) return
  interactionActive = active
  emit('interaction', active)
}

// ==================== Геометрия и ширина ====================
function midpoint(a: StrokePoint, b: StrokePoint) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function segmentWidth(pt: StrokePoint, stroke: Stroke): number {
  if (stroke.eraser || !pt.isPen || !stroke.usePressure) return stroke.size
  const p = Math.max(0, Math.min(1, pt.pressure ?? 0.5))
  const lo = Math.min(stroke.minPw, stroke.maxPw)
  const hi = Math.max(stroke.minPw, stroke.maxPw)
  return Math.max(0.5, stroke.size * (lo + p * (hi - lo)))
}

function setStrokeStyle(stroke: Stroke) {
  if (!ctx) return
  if (stroke.eraser) {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = '#000'
    ctx.fillStyle = '#000'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = stroke.color
    ctx.fillStyle = stroke.color
  }
}

function drawDot(pt: StrokePoint, stroke: Stroke) {
  if (!ctx) return
  setStrokeStyle(stroke)
  const w = segmentWidth(pt, stroke)
  ctx.beginPath()
  ctx.arc(pt.x, pt.y, w / 2, 0, Math.PI * 2)
  ctx.fill()
}

// ==================== Стабилизатор (EMA) ====================
function applyStabilizer(raw: StrokePoint, strength: number): StrokePoint {
  if (strength <= 0) return raw
  if (!stabilizerState) {
    stabilizerState = { x: raw.x, y: raw.y }
    return raw
  }
  const alpha = Math.max(0.1, 1 - (strength / 100) * 0.9)
  const x = stabilizerState.x + (raw.x - stabilizerState.x) * alpha
  const y = stabilizerState.y + (raw.y - stabilizerState.y) * alpha
  stabilizerState = { x, y }
  return { x, y, pressure: raw.pressure, isPen: raw.isPen }
}

// ==================== Автоувеличение высоты по завершении штриха ====================
// Нижняя граница bbox всех штрихов (в CSS-пикселях доски) сравнивается с
// низом доски только после того, как штрих завершён: во время рисования
// высота не меняется. Если штрих подошёл к низу ближе чем на AUTO_GROW_GAP —
// высота разом растёт на AUTO_GROW_STEP, и наружу уходит 'resize'.
const AUTO_GROW_GAP = 25
const AUTO_GROW_STEP = 100

// Самый низкий штрих доски (завершённые; текущий проверяется до сброса).
function strokesBottom(): number {
  let max = 0
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.y > max) max = p.y
    }
  }
  return max
}

// Рост высоты: доска не смонтирована — растить нечего.
function growHeightIfNeeded() {
  const el = containerRef.value
  if (!el) return
  const height = currentHeight()
  if (height <= 0) return
  if (height - strokesBottom() > AUTO_GROW_GAP) return

  el.style.height = `${height + AUTO_GROW_STEP}px`
  emit('resize', height + AUTO_GROW_STEP)
}

// ==================== Инкрементальное рисование ====================
function drawCurrentSegment() {
  if (!ctx || !currentStroke || !lastMid) return
  const pts = currentStroke.points
  setStrokeStyle(currentStroke)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (!currentStroke.smooth) {
    if (pts.length < 2) return
    const prev = pts[pts.length - 2]!
    const curr = pts[pts.length - 1]!
    ctx.lineWidth = segmentWidth(curr, currentStroke)
    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(curr.x, curr.y)
    ctx.stroke()
    lastMid = { x: curr.x, y: curr.y }
    return
  }

  if (pts.length === 2) {
    const mid = midpoint(pts[0]!, pts[1]!)
    ctx.lineWidth = segmentWidth(pts[0]!, currentStroke)
    ctx.beginPath()
    ctx.moveTo(lastMid.x, lastMid.y)
    ctx.lineTo(mid.x, mid.y)
    ctx.stroke()
    lastMid = mid
    return
  }

  if (pts.length >= 3) {
    const prev = pts[pts.length - 2]!
    const curr = pts[pts.length - 1]!
    const mid = midpoint(prev, curr)
    ctx.lineWidth = segmentWidth(curr, currentStroke)
    ctx.beginPath()
    ctx.moveTo(lastMid.x, lastMid.y)
    ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y)
    ctx.stroke()
    lastMid = mid
  }
}

function finishStroke() {
  if (!ctx || !currentStroke) return
  const pts = currentStroke.points
  if (pts.length >= 2 && lastMid && currentStroke.smooth) {
    const last = pts[pts.length - 1]!
    setStrokeStyle(currentStroke)
    ctx.lineWidth = segmentWidth(last, currentStroke)
    ctx.beginPath()
    ctx.moveTo(lastMid.x, lastMid.y)
    ctx.lineTo(last.x, last.y)
    ctx.stroke()
  }
  ctx.globalCompositeOperation = 'source-over'
}

// ==================== Полный redraw (undo/resize) ====================
function redrawStroke(stroke: Stroke) {
  if (!ctx) return
  const pts = stroke.points
  if (pts.length === 0) return

  setStrokeStyle(stroke)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (pts.length === 1) {
    drawDot(pts[0]!, stroke)
    ctx.globalCompositeOperation = 'source-over'
    return
  }

  if (!stroke.smooth) {
    for (let i = 1; i < pts.length; i++) {
      ctx.lineWidth = segmentWidth(pts[i]!, stroke)
      ctx.beginPath()
      ctx.moveTo(pts[i - 1]!.x, pts[i - 1]!.y)
      ctx.lineTo(pts[i]!.x, pts[i]!.y)
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'
    return
  }

  const mid01 = midpoint(pts[0]!, pts[1]!)
  ctx.lineWidth = segmentWidth(pts[0]!, stroke)
  ctx.beginPath()
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  ctx.lineTo(mid01.x, mid01.y)
  ctx.stroke()

  let last = mid01
  for (let i = 1; i < pts.length - 1; i++) {
    const mid = midpoint(pts[i]!, pts[i + 1]!)
    ctx.lineWidth = segmentWidth(pts[i]!, stroke)
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.quadraticCurveTo(pts[i]!.x, pts[i]!.y, mid.x, mid.y)
    ctx.stroke()
    last = mid
  }

  const tail = pts[pts.length - 1]!
  ctx.lineWidth = segmentWidth(tail, stroke)
  ctx.beginPath()
  ctx.moveTo(last.x, last.y)
  ctx.lineTo(tail.x, tail.y)
  ctx.stroke()

  ctx.globalCompositeOperation = 'source-over'
}

function recomputeLastMid() {
  if (!currentStroke) { lastMid = null; return }
  const pts = currentStroke.points
  if (pts.length === 0) { lastMid = null; return }
  if (pts.length === 1) { lastMid = { x: pts[0]!.x, y: pts[0]!.y }; return }
  lastMid = midpoint(pts[pts.length - 2]!, pts[pts.length - 1]!)
}

// ==================== Перерисовка ====================
// Обводка выделенного штриха: та же геометрия, что и у самого штриха (через
// redrawStroke), но синяя и шире на пару пикселей — лежит под чернилами.
const SELECT_COLOR = '#2563eb'
const SELECT_EXTRA = 8

function redrawSelection(s: Stroke) {
  if (!ctx) return
  const saved = { color: s.color, size: s.size }
  s.color = SELECT_COLOR
  s.size = s.size + SELECT_EXTRA
  redrawStroke(s)
  s.color = saved.color
  s.size = saved.size
}

function redrawMarquee() {
  const m = marquee.value
  if (!ctx || !m) return
  ctx.save()
  ctx.fillStyle = 'rgba(37, 99, 235, 0.10)'
  ctx.strokeStyle = SELECT_COLOR
  ctx.lineWidth = 1
  ctx.setLineDash([4, 3])
  ctx.fillRect(m.left, m.top, m.width, m.height)
  ctx.strokeRect(m.left + 0.5, m.top + 0.5, m.width, m.height)
  ctx.restore()
}

function redrawAll() {
  if (!ctx || !canvasRef.value) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  ctx.restore()

  if (selectedIds.value.size > 0) {
    for (const s of strokes) {
      if (selectedIds.value.has(s.id) && !s.eraser) redrawSelection(s)
    }
  }
  for (const s of strokes) redrawStroke(s)
  if (currentStroke) {
    redrawStroke(currentStroke)
    recomputeLastMid()
  }
  redrawMarquee()
  if (ctx) ctx.globalCompositeOperation = 'source-over'
}

// ==================== Undo / redo ====================
// id последнего отменённого штриха — он удаляется из redoStack при новом рисовании,
// а остальные «скрытые» штрихи остаются и доступны по redo.
let pendingRedoId: string | null = null

function emitStrokeUpdate() {
  syncCounters()
  emit('stroke-end', [...strokes])
  emit('strokeComplete', serializeStrokes())
}

// Стирает скрытые (отменённые) штрихи — они пропадают, как только пользователь
// начинает рисовать заново.
function dropRedoStack() {
  if (redoStack.length === 0) return
  redoStack.length = 0
  syncCounters()
}

function doUndo() {
  if (redoStack.length > 0 && redoStack[redoStack.length - 1]!.id === pendingRedoId) {
    pendingRedoId = null
  }
  const s = strokes.pop()
  if (!s) return false
  redoStack.push(s)
  pendingRedoId = s.id
  redrawAll()
  emitStrokeUpdate()
  return true
}

function doRedo() {
  const s = redoStack.pop()
  if (!s) return false
  strokes.push(s)
  redrawAll()
  emitStrokeUpdate()
  return true
}

// ==================== Инициализация / resize ====================
function initCanvas() {
  if (!canvasRef.value) return
  ctx = canvasRef.value.getContext('2d', { alpha: true })
  if (ctx) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.imageSmoothingEnabled = true
  }
}

function handleResize() {
  if (!containerRef.value || !canvasRef.value || !ctx) return

  const rect = containerRef.value.getBoundingClientRect()
  const newDpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.round(rect.width * newDpr))
  const h = Math.max(1, Math.round(rect.height * newDpr))

  if (canvasRef.value.width === w && canvasRef.value.height === h) return

  dpr = newDpr
  canvasRef.value.width = w
  canvasRef.value.height = h

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  redrawAll()
}

function getCoordinates(e: PointerEvent) {
  if (!canvasRef.value) return { x: 0, y: 0 }
  const rect = canvasRef.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function pointerToPoint(e: PointerEvent): StrokePoint {
  const { x, y } = getCoordinates(e)
  return {
    x,
    y,
    pressure: e.pressure ?? 0.5,
    isPen: e.pointerType === 'pen',
  }
}

// ==================== Pointer-события ====================
// Ветка режима перемещения. Рисование в нём отключено, поэтому все события
// canvas сначала уходят сюда: down — старт рамки или перетаскивания,
// move — рост рамки или шаг группы, up — завершение жеста.
function leaveMoveMode() {
  if (!moveMode.value) return
  moveMode.value = false
  gestureEnded()
  // Подсветка выделения живёт в холсте — после выхода её надо стереть.
  redrawAll()
}

function toggleMoveMode() {
  if (moveMode.value) leaveMoveMode()
  else moveMode.value = true
}

function gestureEnded() {
  moveGesture = null
  moveApplied = { x: 0, y: 0 }
  marquee.value = null
}

function onMoveModePointerDown(e: PointerEvent) {
  if (!canvasRef.value || !ctx) return
  if (e.button !== 0) return
  e.preventDefault()

  setInteraction(true)
  const { x, y } = getCoordinates(e)
  const target = strokeAtPoint(x, y)

  // По пустому месту — начинаем новую рамку: прежнее выделение ей и заменится.
  if (!target) {
    selectedIds.value = new Set()
    redrawAll()
    moveGesture = { kind: 'marquee', pointerId: e.pointerId, startX: x, startY: y }
    marquee.value = { left: x, top: y, width: 0, height: 0 }
    canvasRef.value.setPointerCapture(e.pointerId)
    return
  }

  // По штриху — хватаем его. Если штрих не в выделении, выделение идёт только он,
  // иначе тащим всю группу.
  if (!selectedIds.value.has(target.id)) {
    selectedIds.value = new Set([target.id])
    redrawAll()
  }
  moveGesture = { kind: 'drag', pointerId: e.pointerId, startX: x, startY: y }
  canvasRef.value.setPointerCapture(e.pointerId)
}

function onMoveModePointerMove(e: PointerEvent) {
  if (!canvasRef.value || !ctx) return
  const { x, y } = getCoordinates(e)
  cursorPos.value = { x, y }
  setInteraction(true)

  if (!moveGesture) {
    // Курсор над штрихом — его можно тащить; над пустотой — обычная стрелка.
    canvasRef.value.style.cursor = strokeAtPoint(x, y) ? 'move' : 'default'
    return
  }
  if (e.pointerId !== moveGesture.pointerId) return

  const dx = x - moveGesture.startX
  const dy = y - moveGesture.startY

  if (moveGesture.kind === 'marquee') {
    marquee.value = {
      left: Math.min(moveGesture.startX, x),
      top: Math.min(moveGesture.startY, y),
      width: Math.abs(dx),
      height: Math.abs(dy),
    }
    selectedIds.value = new Set(strokesInRect({
      x1: moveGesture.startX,
      y1: moveGesture.startY,
      x2: x,
      y2: y,
    }))
    redrawAll()
    return
  }

  // Шаг считаем от уже применённого смещения: так группа не «накапливает»
  // округления и не дёргается назад.
  const stepX = Math.round(dx) - moveApplied.x
  const stepY = Math.round(dy) - moveApplied.y
  if (stepX === 0 && stepY === 0) return
  moveSelectedStrokes(stepX, stepY)
  moveApplied = { x: moveApplied.x + stepX, y: moveApplied.y + stepY }
  redrawAll()
}

function onMoveModePointerUp(e: PointerEvent) {
  if (!canvasRef.value) return
  if (!moveGesture || e.pointerId !== moveGesture.pointerId) return

  const kind = moveGesture.kind
  gestureEnded()
  redrawAll()

  try {
    canvasRef.value.releasePointerCapture(e.pointerId)
  } catch { /* ignore */ }

  if (kind === 'drag') {
    // Сдвинутые штрихи — обычное изменение ответа: отдаём наружу как штрихи.
    emitStrokeUpdate()
    growHeightIfNeeded()
  }
  setInteraction(false)
}

// Двойной клик по пустому месту выключает режим — привычный выход из выделения.
function onCanvasDblClick(e: MouseEvent) {
  if (!moveMode.value || !canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  if (strokeAtPoint(e.clientX - rect.left, e.clientY - rect.top)) return
  leaveMoveMode()
}

function onPointerDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('.wb-toolbar')) return
  if ((e.target as HTMLElement).closest('.wb-resize-handle')) return
  if (moveMode.value) return onMoveModePointerDown(e)
  if (!canvasRef.value || !ctx) return
  e.preventDefault()

  setInteraction(true) // ★ Пользователь начал взаимодействие

  if (currentPointerId !== null) return

  currentPointerId = e.pointerId
  canvasRef.value.setPointerCapture(e.pointerId)
  drawing = true
  currentIsErasing = currentMode.value === 'eraser' || e.ctrlKey || e.metaKey

  const pt = pointerToPoint(e)
  currentStroke = {
    id: newStrokeId(),
    startedAt: new Date().toISOString(),
    points: [pt],
    color: props.color,
    size: currentIsErasing ? currentEraserSize.value : currentPenSize.value,
    eraser: currentIsErasing,
    smooth: smoothingEnabled.value,
    usePressure: pressureEnabled.value,
    minPw: minPressureWidth.value,
    maxPw: maxPressureWidth.value,
    stabilizer: stabilizerStrength.value,
  }
  lastMid = { x: pt.x, y: pt.y }
  stabilizerState = { x: pt.x, y: pt.y }

  drawDot(pt, currentStroke)
  ctx.globalCompositeOperation = 'source-over'
}

function onPointerMove(e: PointerEvent) {
  if (!canvasRef.value) return
  if (moveMode.value) return onMoveModePointerMove(e)
  const { x, y } = getCoordinates(e)
  cursorPos.value = { x, y }

  // Если перо двигается — значит взаимодействие продолжается
  setInteraction(true)

  showEraserCursor.value = currentMode.value === 'eraser'
    || isCtrlPressed.value || e.ctrlKey || e.metaKey

  if (!drawing || !ctx || !currentStroke) return
  if (e.pointerId !== currentPointerId) return
  e.preventDefault()

  const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null
  const events = coalesced && coalesced.length > 0 ? coalesced : [e]

  const pts = currentStroke.points
  for (const ev of events) {
    const raw = pointerToPoint(ev)
    const pt = applyStabilizer(raw, currentStroke.stabilizer)
    const last = pts[pts.length - 1]!
    const dx = pt.x - last.x
    const dy = pt.y - last.y
    if (dx * dx + dy * dy < 0.01) continue
    pts.push(pt)
    drawCurrentSegment()
  }
}

function onPointerUp(e: PointerEvent) {
  if (moveMode.value) return onMoveModePointerUp(e)
  if (!canvasRef.value || !ctx) return
  if (e.pointerId !== currentPointerId) return

  const finished = currentStroke
  finishStroke()

  if (finished) {
    strokes.push(finished)
    dropRedoStack()
    pendingRedoId = null
    emitStrokeUpdate()
  }

  drawing = false
  currentIsErasing = false
  currentPointerId = null
  currentStroke = null
  lastMid = null
  stabilizerState = null
  ctx.globalCompositeOperation = 'source-over'

  // Штрих завершён — только теперь доска подрастает под его bbox (и шлёт 'resize').
  growHeightIfNeeded()

  try {
    canvasRef.value.releasePointerCapture(e.pointerId)
  } catch { /* ignore */ }
}

function onPointerCancel(e: PointerEvent) {
  if (moveMode.value) return onMoveModePointerUp(e)
  if (e.pointerId !== currentPointerId) return

  finishStroke()
  if (currentStroke) {
    strokes.push(currentStroke)
    dropRedoStack()
    pendingRedoId = null
    emitStrokeUpdate()
  }

  drawing = false
  currentIsErasing = false
  currentPointerId = null
  currentStroke = null
  lastMid = null
  stabilizerState = null
  if (ctx) ctx.globalCompositeOperation = 'source-over'

  // Штрих завершён (жест отменён) — доска подрастает под его bbox.
  growHeightIfNeeded()

  // Отмена жеста — считаем, что взаимодействие прекращено
  setInteraction(false)
}

function onPointerEnter(e: PointerEvent) {
  isPointerInside.value = true
  setInteraction(true) // ★ Курсор зашел на холст (даже без клика)
  if (moveMode.value) return onMoveModePointerMove(e)
  onPointerMove(e)
}

function onPointerLeave() {
  isPointerInside.value = false
  showEraserCursor.value = false
  // ★ Курсор покинул холст — можно запускать ИИ
  setInteraction(false)
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Control' || e.key === 'Meta') {
    isCtrlPressed.value = true
    if (isPointerInside.value) showEraserCursor.value = true
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.key === 'Control' || e.key === 'Meta') {
    isCtrlPressed.value = false
    if (currentMode.value !== 'eraser' && !isPointerInside.value) {
      showEraserCursor.value = false
    }
  }
}

// ==================== Ресайз высоты ====================
// Высота задаётся контейнеру inline-стилем: он size-container, и canvas
// (absolute inset-0) подхватывает новую высоту, а ResizeObserver перерисовывает штрихи.
const resizing = ref(false)
const MIN_HEIGHT = computed(() => Math.max(40, props.minHeight))
let resizeStartY = 0
let resizeStartHeight = 0

// Реальная высота доски в CSS-пикселях (без учёта dpr).
function currentHeight(): number {
  const el = containerRef.value
  if (!el) return 0
  return Math.round(el.getBoundingClientRect().height)
}

// Высота, заданная доске inline-стилем (0 — height не выставлен и берётся из вёрстки).
function appliedHeight(): number {
  const h = Number.parseFloat(containerRef.value?.style.height ?? '')
  return Number.isFinite(h) && h > 0 ? Math.round(h) : 0
}

// Программная установка высоты (высота из сохранённого прохождения).
// В отличие от stopResize, 'resize' здесь НЕ эмитится: это не жест пользователя,
// и подписчики не должны принимать её за ручной ресайз.
// Высота применяется в обе стороны — как больше текущей, так и меньше.
// false — доска ещё не смонтирована, высоту применить нельзя.
function setHeight(height: number | null | undefined): boolean {
  const el = containerRef.value
  const h = Number(height)
  if (!el || !Number.isFinite(h) || h <= 0) return false
  el.style.height = `${Math.max(MIN_HEIGHT.value, Math.round(h))}px`
  return true
}

function startResize(e: PointerEvent) {
  const el = containerRef.value
  if (!el || e.button !== 0) return
  e.preventDefault()
  e.stopPropagation() // не начинать штрих на холсте

  resizing.value = true
  resizeStartY = e.clientY
  // Стартуем от высоты, заданной доске ранее: доску оборачивают в блок с
  // фиксированной высотой (h-full), и getBoundingClientRect() отдал бы её
  // высоту. Без inline-высоты (вертикальная тяга ещё не происходила) берём
  // отрисованную — тягание вниз идёт от неё, а не от MIN_HEIGHT.
  resizeStartHeight = Math.max(MIN_HEIGHT.value, appliedHeight() || currentHeight())
  resizeStartAnswerTop = answerSize.value
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  document.body.style.cursor = 'ns-resize'
  document.body.style.userSelect = 'none'
}

// Минимальное расстояние от линии «Зона ответа» до верхнего края доски, px.
const ANSWER_TOP_GAP = 25

// Позиция линии от верхнего края на старте ресайза (px). Линия привязана к
// верху и при ресайзе стоит на месте, поэтому предел высоты — её позиция + зазор.
let resizeStartAnswerTop = 0

// Нижняя граница высоты при ресайзе: от верха до линии + ANSWER_TOP_GAP.
function minResizeHeight(): number {
  if (!props.answerZone) return MIN_HEIGHT.value
  return Math.max(MIN_HEIGHT.value, Math.round(resizeStartAnswerTop + ANSWER_TOP_GAP))
}

function onResizeMove(e: PointerEvent) {
  const el = containerRef.value
  if (!resizing.value || !el) return
  // Высота «упирается» в minResizeHeight: ниже низ доски не уйдёт.
  const height = Math.max(minResizeHeight(), Math.round(resizeStartHeight + e.clientY - resizeStartY))
  // Inline height ставим всегда: без него доска на долю кадра схлопнулась бы
  // до высоты вёрстки, как только курсор уйдёт выше точки захвата.
  el.style.height = `${height}px`
  // Живая высота во время жеста: контейнер с фиксированной высотой и
  // overflow-hidden без неё обрезал бы доску до отпускания ручки.
  emit('resizeMove', height)
  // Линия «Зона ответа» привязана к верхнему краю — при ресайзе она остаётся
  // на месте, компенсировать смещение низа не нужно.
}

function stopResize(e?: PointerEvent) {
  if (!resizing.value) return
  resizing.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  if (e) {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch { /* ignore */ }
  }
  // Rendered height уже учитывает применённую в этом тике высоту.
  // 'resize' раньше 'strokeComplete': подписчик к моменту сохранения уже
  // знает новую высоту, и она попадает в документ вместе со штрихами.
  const height = currentHeight()
  if (height > 0) emit('resize', height)
}

// ==================== Экспорт изображения ====================
// Отдаёт содержимое холста (со штрихами) как grayscale WebP без потерь и без альфа-канала.
// Непрозрачный белый фон → оттенки серого, альфа принудительно в 255.
// Синхронный: можно вызывать из onPointerUp, пока currentStroke ещё не в модели.
function getImage(): string {
  if (!canvasRef.value) return ''

  const w = canvasRef.value.width
  const h = canvasRef.value.height
  if (w === 0 || h === 0) return ''

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d', { willReadFrequently: true })
  if (!octx) return ''

  // Непрозрачный белый фон (нет альфы)
  octx.fillStyle = '#ffffff'
  octx.fillRect(0, 0, w, h)

  // Штрихи из модели. redrawStroke рисует через модульный ctx — подменяем его на
  // контекст out-холста (без трансформа dpr, координаты = координаты буфера).
  const savedCtx = ctx
  ctx = octx
  for (const s of strokes) redrawStroke(s)

  // Незавершённый текущий штрих (getImage синхронно вызывается из onPointerUp)
  if (currentStroke && currentStroke.points.length > 0) {
    redrawStroke(currentStroke)
  }
  ctx = savedCtx

  // Grayscale + альфа 255
  const imageData = octx.getImageData(0, 0, w, h)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!)
    data[i] = gray
    data[i + 1] = gray
    data[i + 2] = gray
    data[i + 3] = 255
  }
  octx.putImageData(imageData, 0, 0)

  // quality = 1 → lossless для WebP
  return out.toDataURL('image/webp', 1)
}

// ==================== Внешние штрихи (prop strokes) ====================
let lastAppliedStrokeIds: string[] = []
// true, как только холст получил рабочий размер (иначе redrawAll рисует в буфер 0×0)
let layoutReady = false

function syncExternalStrokes() {
  if (props.strokes === undefined) return

  const incomingIds = extractInkStrokes(props.strokes).map(s => s.id).filter(Boolean)
  // Пропа не изменилась (например, собственная запись родителя) — ничего не трогаем
  if (incomingIds.length === lastAppliedStrokeIds.length
    && incomingIds.every((id, i) => id === lastAppliedStrokeIds[i])) {
    return
  }
  lastAppliedStrokeIds = incomingIds

  // Убираем штрихи, которых больше нет во внешних данных
  const allowed = new Set(incomingIds)
  const currentIds = new Set(strokes.map(s => s.id))
  const removed = strokes.some(s => !allowed.has(s.id))
    || incomingIds.some(id => !currentIds.has(id))

  if (!removed) return

  const byId = new Map(strokes.map(s => [s.id, s] as const))
  const settings = effectiveSettings.value
  for (const ink of extractInkStrokes(props.strokes)) {
    if (!byId.has(ink.id)) byId.set(ink.id, deserializeStroke(ink, settings))
  }

  // Порядок — как во входящем документе
  strokes.length = 0
  for (const ink of extractInkStrokes(props.strokes)) {
    const s = byId.get(ink.id)
    if (s) strokes.push(s)
  }
  redoStack.length = 0
  pendingRedoId = null
  lastMid = null
  stabilizerState = null
  redrawAll()
  syncCounters()
  emit('stroke-end', [...strokes])
}

watch(() => props.strokes, syncExternalStrokes, { deep: true })

// ==================== Lifecycle ====================
onMounted(() => {
  initCanvas()

  // Восстанавливаем внешние штрихи до первого resize/redraw.
  // syncExternalStrokes сам запоминает применённые id — повторного срабатывания watch не будет.
  syncExternalStrokes()

  handleResize()

  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      const rect = containerRef.value!.getBoundingClientRect()
      if (!layoutReady) {
        if (rect.width < 1 || rect.height < 1) return
        layoutReady = true
      }
      handleResize()
    })
    resizeObserver.observe(containerRef.value)
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})

onBeforeUnmount(() => {
  if (resizeObserver && containerRef.value) {
    resizeObserver.unobserve(containerRef.value)
  }
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  stopResize()
  stopAnswerDrag()
  currentStroke = null
  lastMid = null
  stabilizerState = null
})

// ==================== Деление штрихов зоной ответа ====================
// Штрих считается целиком: выше линии — решение, ниже неё — ответ. Штрихи,
// пересекающие линию, все уходят в ответ. Набор фиксируется на старте жеста
// (до первого сдвига) и живёт до следующего.
let decisionStrokeIds = new Set<string>()
let answerStrokeIds = new Set<string>()

// Нижняя граница штриха с учётом толщины пера, px.
function strokeBottom(s: Stroke): number {
  let max = Number.NEGATIVE_INFINITY
  for (const p of s.points) {
    max = Math.max(max, p.y + segmentWidth(p, s) / 2)
  }
  return max
}

// Делим текущие штрихи по линии, стоящей на `lineY` px от верхнего края.
// Проверка идёт по нижней точке штриха: если она не опускается ниже линии —
// штрих целиком над ней и это решение. Пересекающий линию штрих — ответ.
function captureAnswerZones(lineY: number) {
  decisionStrokeIds = new Set()
  answerStrokeIds = new Set()
  for (const s of strokes) {
    if (s.points.length === 0) continue
    if (strokeBottom(s) <= lineY) decisionStrokeIds.add(s.id)
    else answerStrokeIds.add(s.id)
  }
  movedAnswerDy = 0
}

// На сколько штрихи-ответ уже сдвинуты текущим жестом (px).
let movedAnswerDy = 0

// Сдвиг штрихов-ответа вниз на dy (dy > 0 — вниз).
function moveAnswerStrokes(dy: number) {
  if (dy === 0) return
  for (const s of strokes) {
    if (!answerStrokeIds.has(s.id)) continue
    for (const p of s.points) p.y += dy
  }
}

// ==================== Выбор и перемещение штрихов ====================
// Попадание считаем по ломаной точек с учётом толщины пера: на тач-экранах
// промах на пару пикселей не должен значить «пустое место».
const HIT_SLOP = 6

// Расстояние от точки до отрезка, px.
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// Ближайший к точке штрих для перетаскивания; null — точка в пустоте.
// Идём от верхних слоёв: перекрывающиеся штрихи хватаются за тот, что виден.
function strokeAtPoint(x: number, y: number): Stroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i]!
    const pts = s.points
    if (pts.length === 0) continue
    let best = Number.POSITIVE_INFINITY
    if (pts.length === 1) {
      best = Math.hypot(x - pts[0]!.x, y - pts[0]!.y)
    } else {
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1]!
        const b = pts[k]!
        best = Math.min(best, distToSegment(x, y, a.x, a.y, b.x, b.y))
      }
    }
    if (best <= s.size / 2 + HIT_SLOP) return s
  }
  return null
}

// Штрихи, которые рамка задела: рамка и штрих пересекаются по любому отрезку.
function strokesInRect(r: { x1: number, y1: number, x2: number, y2: number }): string[] {
  const left = Math.min(r.x1, r.x2)
  const right = Math.max(r.x1, r.x2)
  const top = Math.min(r.y1, r.y2)
  const bottom = Math.max(r.y1, r.y2)
  const hit: string[] = []

  for (const s of strokes) {
    const pts = s.points
    if (pts.length === 0) continue
    // Непрозрачный прямоугольник штриха не заходит в рамку — мимо.
    let sLeft = Number.POSITIVE_INFINITY
    let sRight = Number.NEGATIVE_INFINITY
    let sTop = Number.POSITIVE_INFINITY
    let sBottom = Number.NEGATIVE_INFINITY
    for (const p of pts) {
      const half = segmentWidth(p, s) / 2
      sLeft = Math.min(sLeft, p.x - half)
      sRight = Math.max(sRight, p.x + half)
      sTop = Math.min(sTop, p.y - half)
      sBottom = Math.max(sBottom, p.y + half)
    }
    if (sRight < left || sLeft > right || sBottom < top || sTop > bottom) continue
    // Одна точка внутри рамки — уже пересечение.
    if (pts.some(p => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom)) {
      hit.push(s.id)
      continue
    }
    // Иначе рёбра штриха могут пройти рамку насквозь.
    const corners = [
      [left, top], [right, top], [right, bottom], [left, bottom],
    ] as const
    let crosses = false
    for (let k = 1; k < pts.length && !crosses; k++) {
      const a = pts[k - 1]!
      const b = pts[k]!
      for (const [cx, cy] of corners) {
        if (distToSegment(cx, cy, a.x, a.y, b.x, b.y) <= s.size / 2 + HIT_SLOP) {
          crosses = true
          break
        }
      }
    }
    if (crosses) hit.push(s.id)
  }
  return hit
}

// Сдвиг выделенных штрихов по вертикали и горизонтали, px.
function moveSelectedStrokes(dx: number, dy: number) {
  if (dx === 0 && dy === 0) return
  for (const s of strokes) {
    if (!selectedIds.value.has(s.id)) continue
    for (const p of s.points) {
      p.x += dx
      p.y += dy
    }
  }
}

// ==================== Линия «Зона ответа» ====================
// Горизонтальная полоса на answerSize px от верхнего края доски. Тянется
// указателем вверх-вниз (координата clientY, как у ручки ресайза высоты).
// Вниз — полоса опускается, а нижний край доски едет вместе с ней (доска
// растягивается). Вверх — доска не меняется, полоса просто поднимается к верху.
const answerDragging = ref(false)
// Коррекция отображения полосы на время жеста: полосу можно поднять выше
// верхнего края доски, а в модель пишется честное расстояние (не меньше 0).
// На отпускании коррекция сбрасывается, и полоса встаёт по answerSize.
const answerDragOffset = ref(0)
let answerStartY = 0
let answerStartSize = 0
// Высота доски на старте жеста (px).
let answerStartHeight = 0

function startAnswerDrag(e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation() // не начинать штрих на холсте

  answerDragging.value = true
  answerDragOffset.value = 0
  answerStartY = e.clientY
  answerStartSize = answerSize.value
  answerStartHeight = Math.max(MIN_HEIGHT.value, appliedHeight() || currentHeight())
  // Решение/ответ считаем один раз, по линии там, где она стоит до сдвига.
  captureAnswerZones(answerSize.value)
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  document.body.style.cursor = 'ns-resize'
  document.body.style.userSelect = 'none'
}

function onAnswerDragMove(e: PointerEvent) {
  if (!answerDragging.value) return
  // Смещение указателя по экрану (delta > 0 — вниз).
  const delta = e.clientY - answerStartY
  const el = containerRef.value
  // Полоса идёт под курсором: при тяге вниз от верхнего края, при тяге вверх — к верху.
  const raw = answerStartSize + delta
  answerSize.value = Math.max(ANSWER_SIZE_MIN, Math.round(raw))
  // Низ доски едет за курсором только вниз (доска не уменьшается).
  if (el && delta > 0) {
    const height = Math.max(MIN_HEIGHT.value, Math.round(answerStartHeight + delta))
    if (height !== currentHeight()) {
      el.style.height = `${height}px`
      emit('resizeMove', height)
    }
  } else if (el && delta <= 0) {
    // Полосу поднимают — доска возвращается к состоянию из вёрстки.
    el.style.height = ''
  }
  // Ответ едет вниз ровно за полосой: место под ним появится само, потому
  // что при тяге вниз доска уже выросла. Вверх ответ не возвращаем.
  const shift = Math.max(0, Math.round(delta))
  if (shift !== movedAnswerDy) {
    moveAnswerStrokes(shift - movedAnswerDy)
    movedAnswerDy = shift
    redrawAll()
  }
  // Выше верхнего края жестом показываем полосу под курсором, в модель пишется 0.
  answerDragOffset.value = raw < 0 ? Math.round(raw) : 0
  // Как и рисование: пока полосу тянут, ИИ-инференс на паузе.
  setInteraction(true)
}

function stopAnswerDrag(e?: PointerEvent) {
  if (!answerDragging.value) return
  answerDragging.value = false
  answerDragOffset.value = 0
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  if (e) {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch { /* ignore */ }
  }
  setInteraction(false)
  const height = currentHeight()
  // Позиция полосы и/или высота доски изменились — просим сохранить ответ.
  if (answerSize.value !== answerStartSize || height > 0) {
    // 'resize' раньше 'answerSizeChange': подписчик к сохранению уже знает новую высоту.
    if (height > 0) emit('resize', height)
    emit('answerSizeChange', answerSize.value)
  }
}

// ==================== Публичный API ====================
defineExpose({
  /**
   * Штрихи доски в JSON (InkML-совместимая схема, см. ~/types/ink).
   * `getStrokes()` — документ целиком, `getStrokes(true)` — только массив штрихов.
   */
  getStrokes: (asArray = false): InkDocument | InkStroke[] => {
    const doc = serializeStrokes()
    return asArray ? doc.strokes : doc
  },
  /** Загрузить штрихи (JSON-документ или массив) — заменяет текущее содержимое. */
  loadStrokes: (input: InkDocument | InkStroke[]) => {
    strokes.length = 0
    for (const ink of extractInkStrokes(input)) {
      strokes.push(deserializeStroke(ink, effectiveSettings.value))
    }
    lastAppliedStrokeIds = strokes.map(s => s.id)
    redoStack.length = 0
    pendingRedoId = null
    currentStroke = null
    lastMid = null
    stabilizerState = null
    redrawAll()
    syncCounters()
    emit('stroke-end', [...strokes])
  },
  clear: () => {
    strokes.length = 0
    redoStack.length = 0
    pendingRedoId = null
    currentStroke = null
    lastMid = null
    stabilizerState = null
    redrawAll()
    syncCounters()
    emit('stroke-end', [])
  },
  undo: doUndo,
  redo: doRedo,
  toDataURL: () => canvasRef.value?.toDataURL() ?? '',
  getImage,
  /** Текущая отрисованная высота доски (CSS px, 0 — если ещё не смонтирована). */
  getHeight: currentHeight,
  /** Задать высоту доске прозрачно для подписчиков: без эмита 'resize'. */
  setHeight,
  /** Позиция линии «Зона ответа» (px от верхнего края доски). */
  getAnswerSize: () => answerSize.value,
  /** Выставить позицию линии «Зона ответа» (из сохранённого прохождения). */
  setAnswerSize: (size: number) => {
    const n = Number(size)
    if (!Number.isFinite(n)) return
    answerSize.value = Math.max(ANSWER_SIZE_MIN, Math.round(n))
  },
})
</script>

<template>
  <div
    ref="containerRef"
    class="relative w-full h-full overflow-hidden select-none bg-default"
    :class="{ 'wb-resizing': resizing, 'wb-answer-dragging': answerDragging }"
    style="touch-action: none; -webkit-user-select: none; -webkit-touch-callout: none;"
  >
    <div class="absolute inset-0 pointer-events-none transition-opacity duration-200" :style="bgStyle"></div>

    <canvas
      ref="canvasRef"
      class="absolute inset-0 w-full h-full"
      style="touch-action: none;"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @pointerleave="onPointerLeave"
      @pointerenter="onPointerEnter"
      @dblclick="onCanvasDblClick"
    ></canvas>

    <!-- Undo / redo -->
    <div
      class="wb-toolbar absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-lg border border-default bg-default/90 p-1 shadow-sm backdrop-blur-sm"
      @pointerdown.stop
    >
      <button
        type="button"
        class="p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-default"
        :class="strokeCount > 0 ? 'text-muted hover:bg-elevated' : 'text-muted'"
        :disabled="strokeCount === 0"
        title="Отменить последний штрих"
        @click="doUndo"
      >
        <UIcon name="i-lucide-undo" class="size-4" />
      </button>
      <button
        type="button"
        class="p-1.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-default"
        :class="redoCount > 0 ? 'text-muted hover:bg-elevated' : 'text-muted'"
        :disabled="redoCount === 0"
        title="Вернуть штрих"
        @click="doRedo"
      >
        <UIcon name="i-lucide-redo" class="size-4" />
      </button>
    </div>

    <!-- Тулбар -->
    <div
      v-if="!hideToolbar"
      class="wb-toolbar absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-lg border border-default bg-default/90 p-1 shadow-sm backdrop-blur-sm"
      @pointerdown.stop
    >
      <button
        type="button"
        class="p-1.5 rounded-md transition-colors"
        :class="currentMode === 'pen' && !moveMode ? 'bg-primary text-white' : 'text-muted hover:bg-elevated'"
        title="Перо"
        @click="currentMode = 'pen'; leaveMoveMode()"
      >
        <UIcon name="i-lucide-pencil" class="size-4" />
      </button>
      <!-- Перемещение: между пером и ластиком. -->
      <button
        type="button"
        class="p-1.5 rounded-md transition-colors"
        :class="moveMode ? 'bg-primary text-white' : 'text-muted hover:bg-elevated'"
        :title="moveMode ? 'Выйти из режима перемещения' : 'Перемещение штрихов'"
        @click="toggleMoveMode"
      >
        <UIcon name="i-lucide-mouse-pointer-2" class="size-4" />
      </button>
      <button
        type="button"
        class="p-1.5 rounded-md transition-colors"
        :class="currentMode === 'eraser' && !moveMode ? 'bg-primary text-white' : 'text-muted hover:bg-elevated'"
        title="Ластик"
        @click="currentMode = 'eraser'; leaveMoveMode()"
      >
        <UIcon name="i-lucide-eraser" class="size-4" />
      </button>
    </div>

    <!-- Курсор ластика -->
    <div
      v-if="showEraserCursor"
      class="absolute pointer-events-none transform -translate-x-1/2 -translate-y-1/2 z-40 flex items-center justify-center mix-blend-difference"
      :style="{ width: `${currentEraserSize}px`, height: `${currentEraserSize}px`, left: `${cursorPos.x}px`, top: `${cursorPos.y}px` }"
    >
      <div class="absolute inset-0 rounded-full border-2 border-white bg-white/20"></div>
      <svg xmlns="http://www.w3.org/2000/svg" class="relative z-10 text-white" :style="{ width: `${Math.max(12, currentEraserSize * 0.5)}px`, height: `${Math.max(12, currentEraserSize * 0.5)}px` }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"></path>
        <path d="M22 21H7"></path>
        <path d="m5 11 9 9"></path>
      </svg>
    </div>

    <!-- Линия «Зона ответа»: тянется вверх-вниз, надпись двигается вместе с ней -->
    <div
      v-if="answerZone"
      class="wb-answer-zone"
      :class="{ 'is-active': answerDragging }"
      :style="{ top: `${answerSize + answerDragOffset}px` }"
      title="Потяните, чтобы изменить зону ответа"
      @pointerdown="startAnswerDrag"
      @pointermove="onAnswerDragMove"
      @pointerup="stopAnswerDrag"
      @pointercancel="stopAnswerDrag"
      @lostpointercapture="stopAnswerDrag"
    >
      <div class="wb-answer-line"></div>
      <span class="wb-answer-label">Зона ответа</span>
    </div>

    <!-- Ручка изменения высоты (тянем за нижнюю границу) -->
    <div
      v-if="resizable"
      class="wb-resize-handle"
      title="Потяните, чтобы изменить высоту"
      @pointerdown="startResize"
      @pointermove="onResizeMove"
      @pointerup="stopResize"
      @pointercancel="stopResize"
      @lostpointercapture="stopResize"
    >
      <div class="wb-resize-grip" :class="{ 'is-active': resizing }"></div>
    </div>
  </div>
</template>

<style scoped>
canvas {
  cursor: crosshair;
}

.wb-resize-handle {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 12px;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ns-resize;
  touch-action: none;
}

.wb-resize-grip {
  width: 48px;
  height: 4px;
  border-radius: 999px;
  background: var(--ui-border, #d1d5db);
  opacity: 0.6;
  transition: opacity 0.15s, background-color 0.15s;
}

.wb-resize-handle:hover .wb-resize-grip,
.wb-resize-grip.is-active {
  opacity: 1;
  background: var(--ui-primary, #3b82f6);
}

/* Во время перетаскивания кисть на холсте не нужна */
.wb-resizing canvas {
  cursor: ns-resize;
}

/* ==================== Зона ответа ==================== */
/* Полоса-захват: 12px вокруг линии, чтобы её было удобно тянуть. */
.wb-answer-zone {
  position: absolute;
  left: 0;
  right: 0;
  /* Поднята над холстом, чтобы указатель тянул полосу, а не рисовал. */
  z-index: 35;
  height: 12px;
  /* top задаёт Vue: по умолчанию он совпал бы с верхним краем линии,
     поэтому полоса поднята на половину своей высоты. */
  transform: translateY(-50%);
  /* Верхний край доски может совпасть с полосой — верх не обрезаем,
     иначе полоса у него пропадёт. */
  overflow: visible;
  cursor: ns-resize;
  touch-action: none;
}

.wb-answer-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  margin-top: -1px;
  background: #8b1a1a;
  transition: background-color 0.15s;
}

.wb-answer-zone:hover .wb-answer-line,
.wb-answer-zone.is-active .wb-answer-line {
  background: #b91c1c;
}

.wb-answer-label {
  position: absolute;
  left: 4px;
  top: 100%;
  font-size: 9px;
  line-height: 1;
  color: #8b1a1a;
  white-space: nowrap;
  pointer-events: none;
}

/* Во время перетаскивания полосы кисть на холсте не нужна */
.wb-answer-dragging canvas {
  cursor: ns-resize;
}
</style>
