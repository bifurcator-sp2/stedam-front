<!-- components/Education/Whiteboard/Whiteboard.vue -->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useProfile } from '~/composables/useProfile'

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
  // Восстановленное состояние: grayscale-негатив маски штрихов, полученный из getImage()
  image?: string | null
}>(), {
  color: '#1e3a8a', // тёмно-синий (Tailwind blue-900)
  hideToolbar: false,
  image: null,
})

// События
const emit = defineEmits<{
  (e: 'stroke-end', strokes: Stroke[]): void
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

// Сегмент ластика: отрезок (в координатах канвы), вырезанный из растра
interface EraseSegment {
  x0: number
  y0: number
  x1: number
  y1: number
  width: number
  points: StrokePoint[]
}

interface Stroke {
  points: StrokePoint[]
  color: string
  size: number
  eraser: boolean
  smooth: boolean
  usePressure: boolean
  minPw: number
  maxPw: number
  stabilizer: number
  // Заполняется у ластиков (см. computeEraseSegments)
  erase?: EraseSegment[]
}

const strokes: Stroke[] = []
const redoStack: Stroke[] = []

// Слой штрихов: все рисующие операции идут сюда, при каждой отрисовке он
// компонуется поверх растра (восстановленного изображения) в видимый canvas.
interface StrokeLayer {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

let strokeLayer: StrokeLayer | null = null

// ==================== Восстановленное состояние ====================
// Логическое состояние: растр (перекрашенная маска + следы, «сожжённые» ластиком).
// Хранится отдельно от видимого canvas, поэтому не зависит ни от resize, ни от замены слоя штрихов.
let rasterImage: HTMLImageElement | null = null
let rasterEditCanvas: HTMLCanvasElement | null = null
let rasterEditCtx: CanvasRenderingContext2D | null = null
// Буфер видимого canvas: растр + композитинг слоя штрихов
let sceneCtx: CanvasRenderingContext2D | null = null
let backgroundLoadToken = 0

function loadBackground(src: string | null | undefined) {
  const token = ++backgroundLoadToken

  if (!src) {
    rasterImage = null
    releaseRasterEditCanvas()
    redrawAll()
    return
  }

  const img = new Image()
  img.decoding = 'async'

  const done = () => {
    if (token !== backgroundLoadToken) return
    // Восстановление состояния: маска перекрашивается в текущий цвет письма
    restoreFromMask(img, token)
  }
  const fail = () => {
    if (token !== backgroundLoadToken) return
    rasterImage = null
    releaseRasterEditCanvas()
    redrawAll()
  }

  img.onload = done
  img.onerror = fail
  img.src = src

  // data URL может декодироваться синхронно
  if (img.complete && img.naturalWidth > 0) done()
}

// ==================== Растр: чтение / правка ====================
// Редко (смена image) — меняем сам источник растра. После этого растр считаем неотредактированным.
function releaseRasterEditCanvas() {
  rasterEditCanvas = null
  rasterEditCtx = null
}

// Часто (ластик) — редактируемая копия растра в буфере canvas (в «логических» координатах),
// создаётся лениво при первой правке и переиспользуется.
function getRasterEditCtx(): CanvasRenderingContext2D | null {
  if (rasterEditCtx) return rasterEditCtx
  if (!rasterImage || !canvasRef.value) return null
  if (rasterImage.naturalWidth === 0) return null

  const cw = canvasRef.value.width
  const ch = canvasRef.value.height
  if (cw === 0 || ch === 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const rctx = canvas.getContext('2d')
  if (!rctx) return null

  // Растр «contain» вписан в буфер
  rctx.imageSmoothingEnabled = true
  rctx.imageSmoothingQuality = 'high'
  drawRasterInto(rctx, rasterImage, cw, ch)

  rasterEditCanvas = canvas
  rasterEditCtx = rctx
  return rctx
}

// Рисует растр (или его отредактированную копию) «contain» в буфер w×h
function drawRasterInto(target: CanvasRenderingContext2D, source: HTMLImageElement | HTMLCanvasElement, cw: number, ch: number) {
  const iw = source instanceof HTMLImageElement ? source.naturalWidth : source.width
  const ih = source instanceof HTMLImageElement ? source.naturalHeight : source.height
  if (!iw || !ih) return

  const scale = Math.min(cw / iw, ch / ih)
  const dw = iw * scale
  const dh = ih * scale
  const dx = (cw - dw) / 2
  const dy = (ch - dh) / 2

  target.imageSmoothingEnabled = true
  target.imageSmoothingQuality = 'high'
  target.drawImage(source, dx, dy, dw, dh)
}

// Актуальная логическая картинка растра: отредактированная копия (если была) или исходник
function getRasterSource(): HTMLCanvasElement | HTMLImageElement | null {
  return rasterEditCanvas ?? (rasterImage && rasterImage.naturalWidth > 0 ? rasterImage : null)
}

function drawRaster() {
  if (!sceneCtx || !canvasRef.value) return
  const source = getRasterSource()
  if (!source) return

  sceneCtx.save()
  sceneCtx.setTransform(1, 0, 0, 1, 0, 0)
  sceneCtx.globalCompositeOperation = 'source-over'
  if (rasterEditCanvas) {
    // Копия уже в координатах буфера — переносим 1:1
    sceneCtx.drawImage(rasterEditCanvas, 0, 0)
  } else {
    drawRasterInto(sceneCtx, source, canvasRef.value.width, canvasRef.value.height)
  }
  sceneCtx.restore()
}

// Слой штрихов в размере буфера видимого canvas
function ensureStrokeLayer(): StrokeLayer | null {
  if (!canvasRef.value) return null
  const w = canvasRef.value.width
  const h = canvasRef.value.height
  if (w === 0 || h === 0) return null

  if (strokeLayer && strokeLayer.canvas.width === w && strokeLayer.canvas.height === h) {
    return strokeLayer
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const lctx = canvas.getContext('2d')
  if (!lctx) return null

  lctx.lineCap = 'round'
  lctx.lineJoin = 'round'
  lctx.imageSmoothingEnabled = true

  strokeLayer = { canvas, ctx: lctx }
  return strokeLayer
}

// Прозрачный временный canvas в размере видимого canvas (следы ластика)
function createScratchLayer(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (!canvasRef.value) return null
  const canvas = document.createElement('canvas')
  canvas.width = canvasRef.value.width
  canvas.height = canvasRef.value.height
  const cctx = canvas.getContext('2d')
  if (!cctx) return null
  cctx.lineCap = 'round'
  cctx.lineJoin = 'round'
  return { canvas, ctx: cctx }
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

// ==================== Редактирование растра ====================
// Стирание растра идёт через редактируемую копию (rasterEditCtx), которую можно
// пересобрать с нуля. Но перед тем как «разрушить» картинку нижележащего изображения
// (undo ниже стирающего штриха) — вырезание в этой копии становится необратимым.
// Сегменты ластика (EraseSegment) хранятся в модели: у штриха-ластика — свой путь,
// у стираемых штрихов — след попадания, пока их откат ещё возможен.

// Вырезающие сегменты одного отрезка (в логических координатах)
function eraseSegmentsFor(context: CanvasRenderingContext2D, seg: EraseSegment) {
  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.globalCompositeOperation = 'destination-out'
  context.strokeStyle = '#000'
  context.fillStyle = '#000'
  context.lineCap = 'round'
  context.lineJoin = 'round'

  if (seg.x0 === seg.x1 && seg.y0 === seg.y1) {
    context.beginPath()
    context.arc(seg.x0, seg.y0, seg.width / 2, 0, Math.PI * 2)
    context.fill()
  } else {
    context.lineWidth = seg.width
    context.beginPath()
    context.moveTo(seg.x0, seg.y0)
    context.lineTo(seg.x1, seg.y1)
    context.stroke()
  }
  context.restore()
}

// Применяет сегменты ластика к контексту с трансформом (dpr)
function applyEraseToContext(context: CanvasRenderingContext2D, erase: EraseSegment[]) {
  for (const seg of erase) eraseSegmentsFor(context, seg)
}

// Пути ластиков из модели (собственные сегменты штрихов-ластиков).
// Следы стираемых штрихов (stroke.erase) не учитываем: их undo/redo обрабатывается отдельно.
function collectEraseSegments(): EraseSegment[] {
  const segments: EraseSegment[] = []
  for (const s of strokes) {
    if (s.eraser && s.erase && s.erase.length > 0) segments.push(...s.erase)
  }
  return segments
}

// Пересобирает редактируемую копию растра с нуля: исходный растр + все ластики из модели
function rebuildRaster() {
  releaseRasterEditCanvas()
  if (!rasterImage) return

  const segments = collectEraseSegments()
  if (segments.length === 0) return

  const rctx = getRasterEditCtx()
  if (!rctx) return
  applyEraseToContext(rctx, segments)
}

// Запекает следы ластика штриха прямо в растр (когда откат этого штриха уже невозможен).
// Нужно только для не-ластиков, попавших в redo через undo: базовую копию пересобрать нельзя —
// то, что ластик уже стёр из неё, потеряно.
function burnEraseTrail(stroke: Stroke) {
  if (!stroke.erase || stroke.erase.length === 0) return
  if (!rasterImage) {
    stroke.erase = undefined
    return
  }
  const rctx = getRasterEditCtx()
  if (rctx) applyEraseToContext(rctx, stroke.erase)
  stroke.erase = undefined
}

// ==================== Перерисовка ====================
// Видимый canvas = актуальный растр + слой штрихов (включая незавершённый текущий).
// Ластик живёт в слое штрихов (destination-out); в растр он попадает через его правки.
function redrawAll() {
  if (!ctx || !canvasRef.value) return

  const layer = ensureStrokeLayer()
  if (layer) {
    layer.ctx.save()
    layer.ctx.setTransform(1, 0, 0, 1, 0, 0)
    layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height)
    layer.ctx.restore()

    const savedCtx = ctx
    ctx = layer.ctx
    for (const s of strokes) redrawStroke(s)
    if (currentStroke) {
      redrawStroke(currentStroke)
      recomputeLastMid()
    }
    ctx = savedCtx
  }

  // Композитинг: растр → следы ластика текущего жеста → слой штрихов
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  ctx.restore()

  drawRaster()

  if (layer) {
    // Временные следы ластика ещё не в модели (жест идёт) — рисуем отдельным проходом
    if (currentStroke && currentStroke.eraser && currentStroke.erase && currentStroke.erase.length > 0) {
      const scratch = createScratchLayer()
      if (scratch) {
        scratch.ctx.drawImage(layer.canvas, 0, 0)
        scratch.ctx.save()
        scratch.ctx.scale(dpr, dpr)
        applyEraseToContext(scratch.ctx, currentStroke.erase)
        scratch.ctx.restore()

        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.drawImage(scratch.canvas, 0, 0)
        ctx.restore()
        return
      }
    }

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(layer.canvas, 0, 0)
    ctx.restore()
  }
}

// Начинает штрих: слой штрихов + порт видимого canvas
function beginStrokeDraw(stroke: Stroke, pt: StrokePoint) {
  const layer = ensureStrokeLayer()
  const layerCtx = layer?.ctx ?? null
  if (!layerCtx) return

  const savedCtx = ctx
  ctx = layerCtx
  drawDot(pt, stroke)
  ctx.globalCompositeOperation = 'source-over'
  ctx = savedCtx

  // Точечный ластик — сразу вырезаем и из растра
  if (stroke.eraser && stroke.erase && stroke.erase.length === 0) {
    const rctx = rasterImage ? getRasterEditCtx() : null
    if (rctx) applyEraseToContext(rctx, [{ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, width: segmentWidth(pt, stroke), points: [pt] }])
  }

  redrawAll()
}

// ==================== Инициализация / resize ====================
function initCanvas() {
  if (!canvasRef.value) return
  ctx = canvasRef.value.getContext('2d', { alpha: true })
  sceneCtx = ctx
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

  // В размере буфера изменились и растр, и слой штрихов
  rebuildRaster()
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
    points: [pt],
    color: props.color,
    size: currentIsErasing ? currentEraserSize.value : currentPenSize.value,
    eraser: currentIsErasing,
    smooth: smoothingEnabled.value,
    usePressure: pressureEnabled.value,
    minPw: minPressureWidth.value,
    maxPw: maxPressureWidth.value,
    stabilizer: stabilizerStrength.value,
    erase: [],
  }
  lastMid = { x: pt.x, y: pt.y }
  stabilizerState = { x: pt.x, y: pt.y }

  beginStrokeDraw(currentStroke, pt)
}

function onPointerMove(e: PointerEvent) {
  if (!canvasRef.value) return
  const { x, y } = getCoordinates(e)
  cursorPos.value = { x, y }

  // Если перо двигается — значит взаимодействие продолжается
  setInteraction(true)

  if (currentMode.value === 'eraser' || isCtrlPressed.value || e.ctrlKey || e.metaKey) {
    showEraserCursor.value = true
  } else {
    showEraserCursor.value = false
  }

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
    // Путь ластика: вырезает этот же участок из растра при пересборке и откатывается в undo
    if (currentStroke.eraser && currentStroke.erase) {
      currentStroke.erase.push({
        x0: last.x,
        y0: last.y,
        x1: pt.x,
        y1: pt.y,
        width: segmentWidth(pt, currentStroke),
        points: [last, pt],
      })
    }
  }
}

function onPointerUp(e: PointerEvent) {
  if (!canvasRef.value || !ctx) return
  if (e.pointerId !== currentPointerId) return

  const finished = currentStroke
  finishStroke()

  if (finished) {
    strokes.push(finished)
    redoStack.length = 0
    emit('stroke-end', [...strokes])
  }

  drawing = false
  currentIsErasing = false
  currentPointerId = null
  currentStroke = null
  lastMid = null
  stabilizerState = null
  ctx.globalCompositeOperation = 'source-over'

  // Пересобираем растр и слой штрихов из модели (убирает инкрементальные артефакты)
  rebuildRaster()
  redrawAll()

  try {
    canvasRef.value.releasePointerCapture(e.pointerId)
  } catch { /* ignore */ }
}

function onPointerCancel(e: PointerEvent) {
  if (e.pointerId !== currentPointerId) return

  finishStroke()
  if (currentStroke) {
    strokes.push(currentStroke)
    redoStack.length = 0
    emit('stroke-end', [...strokes])
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

// ==================== Экспорт / восстановление маски штрихов ====================
// Модель цвета пишется в RGB, маска непрозрачности штрихов сохраняется в grayscale-негативе:
//   белый  → прозрачно;  чёрный → полная непрозрачность (там, где писали).
// При восстановлении маска перекрашивается в текущий цвет письма (props.color).

// Полная маска непрозрачности: запекает растр (восстановленное изображение + стёртое
// ластиком) и слой штрихов (с текущим незавершённым штрихом) в один силуэт.
function buildCoverageMask(w: number, h: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const mctx = canvas.getContext('2d')
  if (!mctx) return null

  // 1. Растр: берём актуальную (отредактированную) картинку в координатах буфера
  const raster = getRasterSource()
  if (raster) {
    mctx.save()
    if (raster instanceof HTMLCanvasElement) {
      mctx.drawImage(raster, 0, 0)
    } else {
      drawRasterInto(mctx, raster, w, h)
    }
    mctx.restore()
  }

  // 2. Слой штрихов — уже отрендерен (redrawAll) под теми же координатами
  const layer = ensureStrokeLayer()
  if (layer) mctx.drawImage(layer.canvas, 0, 0)

  // 3. Незавершённый текущий штрих (getImage синхронно вызывается из onPointerUp)
  if (currentStroke && currentStroke.points.length > 0) {
    const scratch = createScratchLayer()
    if (scratch) {
      const savedCtx = ctx
      ctx = scratch.ctx
      redrawStroke(currentStroke)
      ctx = savedCtx
      mctx.drawImage(scratch.canvas, 0, 0)
    }
  }

  mctx.globalCompositeOperation = 'source-over'
  return canvas
}

// Отдаёт маску: grayscale-негатив от запечённого растра + штрихов, WebP без потерь, без альфы.
function getImage(): string {
  if (!canvasRef.value) return ''

  const w = canvasRef.value.width
  const h = canvasRef.value.height
  if (w === 0 || h === 0) return ''

  const mask = buildCoverageMask(w, h)
  if (!mask) return ''

  const mctx = mask.getContext('2d')
  if (!mctx) return ''

  // Негатив + grayscale, альфа принудительно в 255
  const imageData = mctx.getImageData(0, 0, w, h)
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]!
    const gray = 255 - alpha
    data[i] = gray
    data[i + 1] = gray
    data[i + 2] = gray
    data[i + 3] = 255
  }
  mctx.putImageData(imageData, 0, 0)

  return mask.toDataURL('image/webp', 1)
}

// Перекрашивает сохранённую маску (grayscale-негатив) в текущий цвет письма.
// Возвращает canvas с непрозрачными штрихами нужного цвета на прозрачном фоне.
function applyMaskToColor(src: HTMLImageElement): HTMLCanvasElement | null {
  const sw = src.naturalWidth
  const sh = src.naturalHeight
  if (sw === 0 || sh === 0) return null

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = sw
  maskCanvas.height = sh
  const mctx = maskCanvas.getContext('2d', { willReadFrequently: true })
  if (!mctx) return null
  mctx.drawImage(src, 0, 0)

  let imageData: ImageData | null
  try {
    imageData = mctx.getImageData(0, 0, sw, sh)
  } catch {
    // CORS без заголовков (для ссылок) — перекрасить нельзя, рисуем как есть
    imageData = null
  }

  const outCanvas = document.createElement('canvas')
  outCanvas.width = sw
  outCanvas.height = sh
  const octx = outCanvas.getContext('2d')
  if (!octx) return null

  if (!imageData) {
    octx.drawImage(src, 0, 0)
    return outCanvas
  }

  // Цвет письма на весь буфер + маска непрозрачности из негатива
  octx.fillStyle = props.color
  octx.fillRect(0, 0, sw, sh)
  const outData = octx.getImageData(0, 0, sw, sh)
  const whole = outData.data
  const mask = imageData.data
  for (let i = 0; i < mask.length; i += 4) {
    whole[i + 3] = 255 - mask[i]! // белый негатив → прозрачно, чёрный → непрозрачно
  }
  octx.putImageData(outData, 0, 0)

  return outCanvas
}

// Восстановление штрихов из маски: результат становится растром под новыми штрихами.
// Правки растра (ластик) сбрасываются — растр считается «заново открытым».
function restoreFromMask(src: HTMLImageElement, token: number) {
  const colored = applyMaskToColor(src)
  if (!colored) {
    rasterImage = src
    releaseRasterEditCanvas()
    redrawAll()
    return
  }

  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    if (token !== backgroundLoadToken) return
    rasterImage = img
    releaseRasterEditCanvas()
    redrawAll()
  }
  img.onerror = () => {
    if (token !== backgroundLoadToken) return
    rasterImage = src
    releaseRasterEditCanvas()
    redrawAll()
  }
  img.src = colored.toDataURL('image/png')
}

// ==================== Lifecycle ====================
onMounted(() => {
  initCanvas()
  handleResize()

  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => handleResize())
    resizeObserver.observe(containerRef.value)
  }

  // Восстановление состояния (если image передан при монтировании)
  loadBackground(props.image)

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})

// Смена сохранённого состояния извне
watch(() => props.image, (src) => loadBackground(src))

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
  getStrokes: () => strokes,
  clear: () => {
    strokes.length = 0
    redoStack.length = 0
    currentStroke = null
    lastMid = null
    stabilizerState = null
    rebuildRaster()
    redrawAll()
    emit('stroke-end', [])
  },
  undo: () => {
    const s = strokes.pop()
    if (!s) return false
    redoStack.push(s)
    rebuildRaster()
    redrawAll()
    emit('stroke-end', [...strokes])
    return true
  },
  redo: () => {
    const s = redoStack.pop()
    if (!s) return false
    strokes.push(s)
    // Если штрих попал в redo через undo — его след ластика уже вырезан в растёртой
    // копии необратимо, значит запекаем в растр; ластики пересобираются вместе с копией
    if (!s.eraser) burnEraseTrail(s)
    rebuildRaster()
    redrawAll()
    emit('stroke-end', [...strokes])
    return true
  },
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

    <!-- Тулбар -->
    <div
      v-if="!hideToolbar"
      class="wb-toolbar absolute top-2 right-2 z-50 flex items-center gap-1.5 rounded-lg border border-default bg-default/90 p-1 shadow-sm backdrop-blur-sm"
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
