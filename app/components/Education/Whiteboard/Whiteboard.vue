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
}

const strokes: Stroke[] = []
const redoStack: Stroke[] = []

// ==================== Восстановленное состояние ====================
// Растеризованные штрихи из маски (перекрашенные в текущий цвет) — лежат под новыми штрихами.
let backgroundImage: HTMLImageElement | null = null
let backgroundLoadToken = 0

function loadBackground(src: string | null | undefined) {
  const token = ++backgroundLoadToken

  if (!src) {
    backgroundImage = null
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
    backgroundImage = null
    redrawAll()
  }

  img.onload = done
  img.onerror = fail
  img.src = src

  // data URL может декодироваться синхронно
  if (img.complete && img.naturalWidth > 0) done()
}

function drawBackground() {
  if (!ctx || !canvasRef.value || !backgroundImage) return
  if (backgroundImage.naturalWidth === 0) return

  // «contain»: вписываем в буфер без искажений и обрезки
  const cw = canvasRef.value.width
  const ch = canvasRef.value.height
  const iw = backgroundImage.naturalWidth
  const ih = backgroundImage.naturalHeight
  const scale = Math.min(cw / iw, ch / ih)
  const dw = iw * scale
  const dh = ih * scale
  const dx = (cw - dw) / 2
  const dy = (ch - dh) / 2

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(backgroundImage, dx, dy, dw, dh)
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

function redrawAll() {
  if (!ctx || !canvasRef.value) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  ctx.restore()

  drawBackground()

  for (const s of strokes) redrawStroke(s)
  if (currentStroke) {
    redrawStroke(currentStroke)
    recomputeLastMid()
  }
  ctx.globalCompositeOperation = 'source-over'
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
  }
}

function onPointerUp(e: PointerEvent) {
  if (!canvasRef.value || !ctx) return
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

type MaskableCanvas = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

// Рисуем штрих (с учётом «резиновой» сегментации пера) в произвольный контекст
function paintStroke(context: MaskableCanvas, stroke: Stroke) {
  const savedCtx = ctx
  ctx = context as CanvasRenderingContext2D

  const pts = stroke.points
  context.globalCompositeOperation = stroke.eraser ? 'destination-out' : 'source-over'
  context.strokeStyle = stroke.eraser ? '#000' : stroke.color
  context.fillStyle = stroke.eraser ? '#000' : stroke.color
  context.lineCap = 'round'
  context.lineJoin = 'round'

  if (pts.length === 1) {
    drawDot(pts[0]!, stroke)
  } else if (!stroke.smooth) {
    for (let i = 1; i < pts.length; i++) {
      context.lineWidth = segmentWidth(pts[i]!, stroke)
      context.beginPath()
      context.moveTo(pts[i - 1]!.x, pts[i - 1]!.y)
      context.lineTo(pts[i]!.x, pts[i]!.y)
      context.stroke()
    }
  } else {
    // То же геометрическое разбиение, что и в redrawStroke(), но на переданном контексте
    const mid01 = midpoint(pts[0]!, pts[1]!)
    context.lineWidth = segmentWidth(pts[0]!, stroke)
    context.beginPath()
    context.moveTo(pts[0]!.x, pts[0]!.y)
    context.lineTo(mid01.x, mid01.y)
    context.stroke()

    let last = mid01
    for (let i = 1; i < pts.length - 1; i++) {
      const mid = midpoint(pts[i]!, pts[i + 1]!)
      context.lineWidth = segmentWidth(pts[i]!, stroke)
      context.beginPath()
      context.moveTo(last.x, last.y)
      context.quadraticCurveTo(pts[i]!.x, pts[i]!.y, mid.x, mid.y)
      context.stroke()
      last = mid
    }

    const tail = pts[pts.length - 1]!
    context.lineWidth = segmentWidth(tail, stroke)
    context.beginPath()
    context.moveTo(last.x, last.y)
    context.lineTo(tail.x, tail.y)
    context.stroke()
  }

  context.globalCompositeOperation = 'source-over'
  ctx = savedCtx
}

// Полная маска непрозрачности (белое = писалось, прозрачное = нет)
function buildCoverageMask(w: number, h: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const mctx = canvas.getContext('2d')
  if (!mctx) return null

  const all = recomposeStrokes()
  for (const s of all) {
    if (s.points.length > 0) paintStroke(mctx, s)
  }
  mctx.globalCompositeOperation = 'source-over'
  return canvas
}

// Штрихи модели + незавершённый текущий штрих (getImage вызывается из onPointerUp до сохранения)
function recomposeStrokes(): Stroke[] {
  return currentStroke ? [...strokes, currentStroke] : strokes
}

// Отдаёт маску штрихов: grayscale-негатив WebP без потерь, без альфа-канала.
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

// Восстановление штрихов из маски: результат становится фоном (картинкой) под новыми штрихами
function restoreFromMask(src: HTMLImageElement, token: number) {
  const colored = applyMaskToColor(src)
  if (!colored) {
    backgroundImage = src
    redrawAll()
    return
  }

  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    if (token !== backgroundLoadToken) return
    backgroundImage = img
    redrawAll()
  }
  img.onerror = () => {
    if (token !== backgroundLoadToken) return
    backgroundImage = src
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
    redrawAll()
    emit('stroke-end', [])
  },
  undo: () => {
    const s = strokes.pop()
    if (!s) return false
    redoStack.push(s)
    redrawAll()
    emit('stroke-end', [...strokes])
    return true
  },
  redo: () => {
    const s = redoStack.pop()
    if (!s) return false
    strokes.push(s)
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
