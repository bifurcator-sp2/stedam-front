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
}>(), {
  color: '#000000',
  hideToolbar: false,
  strokes: undefined,
})

// События
const emit = defineEmits<{
  (e: 'stroke-end', strokes: Stroke[]): void
  /** ★ Штрих завершён. Отдаёт весь документ в InkML-совместимом JSON. */
  (e: 'strokeComplete', doc: InkDocument): void
  // ★ Новое событие для управления паузой ИИ-инференса
  (e: 'interaction', active: boolean): void
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
function redrawAll() {
  if (!ctx || !canvasRef.value) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  ctx.restore()

  for (const s of strokes) redrawStroke(s)
  if (currentStroke) {
    redrawStroke(currentStroke)
    recomputeLastMid()
  }
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
function onPointerDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('.wb-toolbar')) return
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

  try {
    canvasRef.value.releasePointerCapture(e.pointerId)
  } catch { /* ignore */ }
}

function onPointerCancel(e: PointerEvent) {
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

  // Отмена жеста — считаем, что взаимодействие прекращено
  setInteraction(false)
}

function onPointerEnter(e: PointerEvent) {
  isPointerInside.value = true
  setInteraction(true) // ★ Курсор зашел на холст (даже без клика)
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
  currentStroke = null
  lastMid = null
  stabilizerState = null
})

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
})
</script>

<template>
  <div
    ref="containerRef"
    class="relative w-full h-full overflow-hidden select-none bg-default"
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
        :class="currentMode === 'pen' ? 'bg-primary text-white' : 'text-muted hover:bg-elevated'"
        title="Перо"
        @click="currentMode = 'pen'"
      >
        <UIcon name="i-lucide-pencil" class="size-4" />
      </button>
      <button
        type="button"
        class="p-1.5 rounded-md transition-colors"
        :class="currentMode === 'eraser' ? 'bg-primary text-white' : 'text-muted hover:bg-elevated'"
        title="Ластик"
        @click="currentMode = 'eraser'"
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
  </div>
</template>

<style scoped>
canvas {
  cursor: crosshair;
}
</style>
