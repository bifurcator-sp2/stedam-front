<!-- components/Constructor/Whiteboard.vue -->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = withDefaults(defineProps<{
  penSize?: number
  eraserSize?: number
  color?: string
}>(), {
  penSize: 3,
  eraserSize: 30,
  color: '#000000',
})

// ==================== Настройки (с сохранением в localStorage) ====================

const STORAGE_KEY = 'whiteboard_settings'

const loadSettings = () => {
  if (import.meta.server) return { pen: props.penSize, eraser: props.eraserSize, mode: 'pen' as const }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        pen: parsed.pen ?? props.penSize,
        eraser: parsed.eraser ?? props.eraserSize,
        mode: parsed.mode ?? 'pen'
      }
    }
  } catch (e) {
    console.warn('Failed to load whiteboard settings', e)
  }
  return { pen: props.penSize, eraser: props.eraserSize, mode: 'pen' as const }
}

const settings = loadSettings()

const currentMode = ref<'pen' | 'eraser'>(settings.mode)
const currentPenSize = ref<number>(settings.pen)
const currentEraserSize = ref<number>(settings.eraser)

watch([currentMode, currentPenSize, currentEraserSize], () => {
  if (import.meta.client) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: currentMode.value,
      pen: currentPenSize.value,
      eraser: currentEraserSize.value
    }))
  }
})

// ==================== Состояние холста ====================

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

let ctx: CanvasRenderingContext2D | null = null
let resizeObserver: ResizeObserver | null = null

let drawing = false
let isErasing = false
let currentPointerId: number | null = null

// Для интерполяции
let lastX = 0
let lastY = 0

const cursorPos = ref({ x: -100, y: -100 })
const showEraserCursor = ref(false)
const isPointerInside = ref(false)
const isCtrlPressed = ref(false)

// ==================== Инициализация ====================

function initCanvas() {
  if (!canvasRef.value) return
  ctx = canvasRef.value.getContext('2d', { alpha: true })
  if (ctx) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.imageSmoothingEnabled = true // Включаем сглаживание
  }
}

function handleResize() {
  if (!containerRef.value || !canvasRef.value || !ctx) return

  const rect = containerRef.value.getBoundingClientRect()

  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = canvasRef.value.width
  tempCanvas.height = canvasRef.value.height
  const tempCtx = tempCanvas.getContext('2d')
  if (tempCtx) {
    tempCtx.imageSmoothingEnabled = true
    tempCtx.drawImage(canvasRef.value, 0, 0)
  }

  canvasRef.value.width = rect.width
  canvasRef.value.height = rect.height

  ctx.imageSmoothingEnabled = true
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  if (tempCanvas.width > 0 && tempCanvas.height > 0) {
    ctx.drawImage(tempCanvas, 0, 0)
  }
}

function getCoordinates(e: PointerEvent) {
  if (!canvasRef.value) return { x: 0, y: 0 }
  const rect = canvasRef.value.getBoundingClientRect()
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  }
}

// ==================== Рисование (сглаженное) ====================

// Функция для рисования гладкой линии между двумя точками
function drawSmoothLine(x1: number, y1: number, x2: number, y2: number) {
  if (!ctx) return

  // Расстояние между точками
  const dx = x2 - x1
  const dy = y2 - y1
  const distance = Math.sqrt(dx * dx + dy * dy)

  // Шаг отрисовки (чем меньше, тем глаже, но тяжелее для процессора)
  const step = 1.5
  const steps = Math.ceil(distance / step)

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = x1 + dx * t
    const y = y1 + dy * t

    ctx.beginPath()
    ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fillStyle = isErasing ? '#000' : (ctx.strokeStyle as string)
    ctx.fill()
  }
}

function onPointerDown(e: PointerEvent) {
  if ((e.target as HTMLElement).closest('.wb-toolbar')) return
  if (!canvasRef.value || !ctx) return
  e.preventDefault()

  if (currentPointerId !== null) return

  currentPointerId = e.pointerId
  canvasRef.value.setPointerCapture(e.pointerId)
  drawing = true

  isErasing = currentMode.value === 'eraser' || e.ctrlKey || e.metaKey

  if (isErasing) {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.lineWidth = currentEraserSize.value
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = props.color
    ctx.strokeStyle = props.color
    ctx.lineWidth = currentPenSize.value
  }

  const { x, y } = getCoordinates(e)
  lastX = x
  lastY = y

  // Рисуем точку при клике
  ctx.beginPath()
  ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2)
  ctx.fill()
}

function onPointerMove(e: PointerEvent) {
  if (!canvasRef.value) return

  const { x, y } = getCoordinates(e)
  cursorPos.value = { x, y }

  if (currentMode.value === 'eraser' || isCtrlPressed.value || e.ctrlKey || e.metaKey) {
    showEraserCursor.value = true
  } else {
    showEraserCursor.value = false
  }

  if (!drawing || !ctx) return
  if (e.pointerId !== currentPointerId) return

  e.preventDefault()

  if (!isErasing) {
    if (e.pointerType === 'pen' && e.pressure > 0) {
      ctx.lineWidth = currentPenSize.value * (0.5 + e.pressure * 1.5)
    } else {
      ctx.lineWidth = currentPenSize.value
    }
  }

  // Отрисовка с интерполяцией
  drawSmoothLine(lastX, lastY, x, y)

  lastX = x
  lastY = y
}

function onPointerUp(e: PointerEvent) {
  if (!canvasRef.value || !ctx) return
  if (e.pointerId !== currentPointerId) return

  drawing = false
  isErasing = false
  currentPointerId = null
  ctx.globalCompositeOperation = 'source-over'

  try {
    canvasRef.value.releasePointerCapture(e.pointerId)
  } catch { /* ignore */ }
}

function onPointerCancel(e: PointerEvent) {
  if (e.pointerId === currentPointerId) {
    drawing = false
    isErasing = false
    currentPointerId = null
    if (ctx) ctx.globalCompositeOperation = 'source-over'
  }
}

// ==================== Курсор и клавиатура ====================

function onPointerEnter(e: PointerEvent) {
  isPointerInside.value = true
  onPointerMove(e)
}

function onPointerLeave() {
  isPointerInside.value = false
  showEraserCursor.value = false
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

// ==================== Lifecycle ====================

onMounted(() => {
  initCanvas()
  handleResize()

  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => handleResize())
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
})

watch(currentMode, (newMode) => {
  if (newMode === 'eraser' && isPointerInside.value) {
    showEraserCursor.value = true
  } else if (newMode === 'pen' && !isCtrlPressed.value) {
    showEraserCursor.value = false
  }
})
</script>

<template>
  <div
    ref="containerRef"
    class="relative w-full h-full overflow-hidden select-none"
    style="touch-action: none; -webkit-user-select: none; -webkit-touch-callout: none;"
  >
    <!-- Холст -->
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

    <!-- Панель управления -->
    <div
      class="wb-toolbar absolute top-2 right-2 z-50 flex items-center gap-1.5 rounded-lg border border-default bg-default/90 p-1 shadow-sm backdrop-blur-sm"
      @pointerdown.stop
    >
      <div class="flex rounded-md overflow-hidden border border-default">
        <button
          type="button"
          class="p-1.5 transition-colors"
          :class="currentMode === 'pen' ? 'bg-primary text-white' : 'bg-elevated text-muted hover:bg-elevated/80'"
          title="Перо"
          @click="currentMode = 'pen'"
        >
          <UIcon name="i-lucide-pencil" class="size-4" />
        </button>
        <button
          type="button"
          class="p-1.5 transition-colors border-l border-default"
          :class="currentMode === 'eraser' ? 'bg-primary text-white' : 'bg-elevated text-muted hover:bg-elevated/80'"
          title="Ластик"
          @click="currentMode = 'eraser'"
        >
          <UIcon name="i-lucide-eraser" class="size-4" />
        </button>
      </div>

      <div class="flex items-center gap-1 px-1.5 border-l border-default h-6">
        <span class="text-[10px] text-muted uppercase font-bold">Толщина</span>
        <input
          type="range"
          :min="1"
          :max="20"
          v-model.number="currentPenSize"
          class="w-16 h-1 bg-default rounded-lg appearance-none cursor-pointer accent-primary"
          title="Размер пера"
        >
        <span class="text-[10px] text-muted tabular-nums w-3 text-right">{{ currentPenSize }}</span>
      </div>
    </div>

    <!-- Иконка-курсор ластика -->
    <div
      v-if="showEraserCursor"
      class="absolute pointer-events-none transform -translate-x-1/2 -translate-y-1/2 z-40 flex items-center justify-center mix-blend-difference"
      :style="{
        width: `${currentEraserSize}px`,
        height: `${currentEraserSize}px`,
        left: `${cursorPos.x}px`,
        top: `${cursorPos.y}px`,
      }"
    >
      <div class="absolute inset-0 rounded-full border-2 border-white bg-white/20"></div>

      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="relative z-10 text-white"
        :style="{ width: `${Math.max(12, currentEraserSize * 0.5)}px`, height: `${Math.max(12, currentEraserSize * 0.5)}px` }"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      >
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
