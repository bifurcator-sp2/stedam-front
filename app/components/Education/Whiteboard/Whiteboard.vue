<!-- components/Education/Whiteboard/Whiteboard.vue -->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { useProfile } from '~/composables/useProfile'

const props = withDefaults(defineProps<{
  settings?: {
    penSize?: number
    eraserSize?: number
    bg?: 'none' | 'lined' | 'grid' | 'dots'
    bgOpacity?: number
    bgScale?: number
    bgColor?: string
  }
  color?: string
  hideToolbar?: boolean
}>(), {
  color: '#000000',
  hideToolbar: false,
})

const { userData } = useProfile()

// Приоритет: 1) Пропс (для предпросмотра в форме), 2) Глобальный профиль, 3) Дефолт
const effectiveSettings = computed(() => {
  if (props.settings) return props.settings
  if (userData.value?.settings?.ink) return userData.value.settings.ink
  return {
    penSize: 3,
    eraserSize: 30,
    bg: 'none',
    bgOpacity: 1,
    bgScale: 1,
    bgColor: '#d1d5db'
  }
})

const currentMode = ref<'pen' | 'eraser'>('pen')
const currentPenSize = computed(() => effectiveSettings.value.penSize ?? 3)
const currentEraserSize = computed(() => effectiveSettings.value.eraserSize ?? 30)
const currentBg = computed(() => effectiveSettings.value.bg ?? 'none')
const bgOpacity = computed(() => effectiveSettings.value.bgOpacity ?? 1)
const bgScale = computed(() => effectiveSettings.value.bgScale ?? 1)
const bgColor = computed(() => effectiveSettings.value.bgColor ?? '#d1d5db')

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

// ==================== Состояние холста ====================

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

let ctx: CanvasRenderingContext2D | null = null
let resizeObserver: ResizeObserver | null = null

let drawing = false
let isErasing = false
let currentPointerId: number | null = null

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
    ctx.imageSmoothingEnabled = true
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

// ==================== Рисование ====================

function drawSmoothLine(x1: number, y1: number, x2: number, y2: number) {
  if (!ctx) return

  const dx = x2 - x1
  const dy = y2 - y1
  const distance = Math.sqrt(dx * dx + dy * dy)

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
