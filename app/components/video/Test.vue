<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

// Направление взгляда
const gazeDirection = ref<'center' | 'left' | 'right' | 'up' | 'down' | 'unknown'>('unknown')
const gazeRatio = ref({ h: 0.5, v: 0.5 })

// Состояние лица и глаз
const faceDetected = ref(false)
const leftEyeOpen = ref(false)
const rightEyeOpen = ref(false)
const eyesState = ref<'both-open' | 'left-closed' | 'right-closed' | 'both-closed' | 'unknown'>('unknown')

// Калибровка взгляда
const isCalibrated = ref(false)

// Индексы landmarks MediaPipe Face Mesh — радужка
const LEFT_IRIS = [468, 469, 470, 471, 472]
const RIGHT_IRIS = [473, 474, 475, 476, 477]

// Контуры глаз для ratio
const LEFT_EYE = { left: 33, right: 133, top: 159, bottom: 145 }
const RIGHT_EYE = { left: 362, right: 263, top: 386, bottom: 374 }

// Точки для EAR (6 точек на глаз)
const LEFT_EYE_EAR = [33, 160, 158, 133, 153, 144]
const RIGHT_EYE_EAR = [263, 387, 385, 362, 380, 373]

// Контуры глаз для визуализации
const LEFT_EYE_CONTOUR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
const RIGHT_EYE_CONTOUR = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]

// Калибровочные смещения
let calibrationOffset = { h: 0, v: 0 }

// Буферы сглаживания взгляда
const SMOOTHING_WINDOW = 8
const hBuffer: number[] = []
const vBuffer: number[] = []

// Буферы сглаживания EAR
const EAR_SMOOTH = 5
const leftEarBuf: number[] = []
const rightEarBuf: number[] = []

// Пороги
const H_THRESHOLD = 0.12
const V_THRESHOLD = 0.12
const EAR_THRESHOLD = 0.18

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(script)
  })
}

function getIrisCenter(landmarks: any[], indices: number[]) {
  let x = 0, y = 0
  for (const i of indices) {
    x += landmarks[i].x
    y += landmarks[i].y
  }
  return { x: x / indices.length, y: y / indices.length }
}

function getEyeRatio(
  landmarks: any[],
  irisIndices: number[],
  eye: { left: number, right: number, top: number, bottom: number },
) {
  const iris = getIrisCenter(landmarks, irisIndices)
  const leftCorner = landmarks[eye.left]
  const rightCorner = landmarks[eye.right]
  const topLid = landmarks[eye.top]
  const bottomLid = landmarks[eye.bottom]

  const hRatio = (iris.x - leftCorner.x) / (rightCorner.x - leftCorner.x)
  const vRatio = (iris.y - topLid.y) / (bottomLid.y - topLid.y)

  return { h: hRatio, v: vRatio }
}

function euclidean(a: { x: number, y: number }, b: { x: number, y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Eye Aspect Ratio — вертикаль / горизонталь глаза */
function eyeAspectRatio(landmarks: any[], eye: number[]): number {
  const [p1, p2, p3, p4, p5, p6] = eye.map(i => landmarks[i])
  const vertical = euclidean(p2, p6) + euclidean(p3, p5)
  const horizontal = 2 * euclidean(p1, p4)
  return horizontal === 0 ? 0 : vertical / horizontal
}

function smooth(value: number, buffer: number[]): number {
  buffer.push(value)
  if (buffer.length > SMOOTHING_WINDOW) buffer.shift()
  return buffer.reduce((a, b) => a + b, 0) / buffer.length
}

function smoothEar(value: number, buffer: number[]): number {
  buffer.push(value)
  if (buffer.length > EAR_SMOOTH) buffer.shift()
  return buffer.reduce((a, b) => a + b, 0) / buffer.length
}

function calibrate() {
  calibrationOffset.h = gazeRatio.value.h - 0.5
  calibrationOffset.v = gazeRatio.value.v - 0.5
  isCalibrated.value = true
}

function drawPupil(landmarks: any[], indices: number[], color = 'red') {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const center = getIrisCenter(landmarks, indices)
  const x = center.x * canvas.width
  const y = center.y * canvas.height
  const size = 18

  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.strokeRect(x - size / 2, y - size / 2, size, size)

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, 3, 0, Math.PI * 2)
  ctx.fill()
}

function drawEyeContour(landmarks: any[], contour: number[], color: string, closed: boolean) {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.beginPath()
  contour.forEach((idx, i) => {
    const p = landmarks[idx]
    const x = p.x * canvas.width
    const y = p.y * canvas.height
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.closePath()

  if (closed) {
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)'
    ctx.fill()
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawGazeVisualization(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const centerX = w / 2
  const centerY = h / 2
  const visualRadius = Math.min(w, h) * 0.25

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(centerX, centerY, visualRadius * 0.4, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(centerX - 15, centerY)
  ctx.lineTo(centerX + 15, centerY)
  ctx.moveTo(centerX, centerY - 15)
  ctx.lineTo(centerX, centerY + 15)
  ctx.stroke()

  const hOffset = (gazeRatio.value.h - 0.5 - calibrationOffset.h) * 2
  const vOffset = (gazeRatio.value.v - 0.5 - calibrationOffset.v) * 2

  const clampedH = Math.max(-1, Math.min(1, hOffset))
  const clampedV = Math.max(-1, Math.min(1, vOffset))

  const gazeX = centerX + clampedH * visualRadius
  const gazeY = centerY + clampedV * visualRadius

  ctx.strokeStyle = 'rgba(0, 255, 200, 0.6)'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  ctx.moveTo(centerX, centerY)
  ctx.lineTo(gazeX, gazeY)
  ctx.stroke()
  ctx.setLineDash([])

  const dotColor =
    gazeDirection.value === 'center' ? '#00ff88' :
      gazeDirection.value === 'unknown' ? '#888888' :
        '#ffaa00'

  ctx.fillStyle = dotColor
  ctx.beginPath()
  ctx.arc(gazeX, gazeY, 10, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = 'white'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(gazeX, gazeY, 10, 0, Math.PI * 2)
  ctx.stroke()
}

// === Computed для UI ===
const eyeStatusText = computed(() => {
  switch (eyesState.value) {
    case 'both-open':    return '👀 Открыты'
    case 'both-closed':  return '😑 Закрыты'
    case 'left-closed':  return '◀ Левый закрыт'
    case 'right-closed': return '▶ Правый закрыт'
    default:             return '❓ —'
  }
})

const eyeStatusClass = computed(() => {
  switch (eyesState.value) {
    case 'both-open':    return 'ok'
    case 'both-closed':  return 'bad'
    case 'left-closed':
    case 'right-closed': return 'warn'
    default:             return 'neutral'
  }
})

const gazeText = computed(() => {
  switch (gazeDirection.value) {
    case 'center': return '🎯 Центр'
    case 'left':   return '⬅️ Влево'
    case 'right':  return '➡️ Вправо'
    case 'up':     return '⬆️ Вверх'
    case 'down':   return '⬇️ Вниз'
    default:       return '❓ —'
  }
})

const gazeClass = computed(() => {
  if (gazeDirection.value === 'center') return 'ok'
  if (gazeDirection.value === 'unknown') return 'neutral'
  return 'warn'
})

const config = useRuntimeConfig()
const baseURL = config.app.baseURL


onMounted(async () => {
  if (!import.meta.client) return
  if (!videoRef.value || !canvasRef.value) return

  await Promise.all([
    loadScript(`${baseURL}mediapipe/face_mesh.js`),
    loadScript(`${baseURL}mediapipe/camera_utils.js`),
  ])

  const FaceMesh = (window as any).FaceMesh
  const Camera = (window as any).Camera

  if (!FaceMesh || !Camera) {
    console.error('MediaPipe libraries not loaded')
    return
  }

  const video = videoRef.value
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')!

  const faceMesh = new FaceMesh({
    locateFile: (file: string) => `${baseURL}mediapipe/${file}`,
  })

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })

  faceMesh.onResults((results: any) => {
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // === Лицо не найдено ===
    if (!results.multiFaceLandmarks?.length) {
      faceDetected.value = false
      leftEyeOpen.value = false
      rightEyeOpen.value = false
      eyesState.value = 'unknown'
      gazeDirection.value = 'unknown'
      return
    }

    faceDetected.value = true
    const landmarks = results.multiFaceLandmarks[0]

    // === Взгляд ===
    const left = getEyeRatio(landmarks, LEFT_IRIS, LEFT_EYE)
    const right = getEyeRatio(landmarks, RIGHT_IRIS, RIGHT_EYE)

    const rawH = (left.h + (1 - right.h)) / 2
    const rawV = (left.v + right.v) / 2

    const smoothH = smooth(rawH, hBuffer)
    const smoothV = smooth(rawV, vBuffer)

    gazeRatio.value = { h: smoothH, v: smoothV }

    const hOffset = smoothH - 0.5 - calibrationOffset.h
    const vOffset = smoothV - 0.5 - calibrationOffset.v

    if (Math.abs(hOffset) < H_THRESHOLD && Math.abs(vOffset) < V_THRESHOLD) {
      gazeDirection.value = 'center'
    } else if (Math.abs(hOffset) > Math.abs(vOffset)) {
      gazeDirection.value = hOffset > 0 ? 'left' : 'right'
    } else {
      gazeDirection.value = vOffset > 0 ? 'down' : 'up'
    }

    // === Открытость глаз (EAR) ===
    const leftEar = smoothEar(eyeAspectRatio(landmarks, LEFT_EYE_EAR), leftEarBuf)
    const rightEar = smoothEar(eyeAspectRatio(landmarks, RIGHT_EYE_EAR), rightEarBuf)

    const leftClosed = leftEar < EAR_THRESHOLD
    const rightClosed = rightEar < EAR_THRESHOLD

    leftEyeOpen.value = !leftClosed
    rightEyeOpen.value = !rightClosed

    if (leftClosed && rightClosed) eyesState.value = 'both-closed'
    else if (leftClosed) eyesState.value = 'left-closed'
    else if (rightClosed) eyesState.value = 'right-closed'
    else eyesState.value = 'both-open'

    // Если глаза закрыты — взгляд не определён
    if (eyesState.value === 'both-closed') {
      gazeDirection.value = 'unknown'
    }

    // === Отрисовка ===
    drawPupil(landmarks, LEFT_IRIS, 'red')
    drawPupil(landmarks, RIGHT_IRIS, 'red')

    drawEyeContour(landmarks, LEFT_EYE_CONTOUR, leftEyeOpen.value ? 'lime' : 'red', !leftEyeOpen.value)
    drawEyeContour(landmarks, RIGHT_EYE_CONTOUR, rightEyeOpen.value ? 'lime' : 'red', !rightEyeOpen.value)

    drawGazeVisualization(ctx, canvas.width, canvas.height)
  })

  const camera = new Camera(video, {
    onFrame: async () => {
      await faceMesh.send({ image: video })
    },
    width: 640,
    height: 480,
  })

  camera.start()

  onBeforeUnmount(() => {
    camera.stop?.()
    faceMesh.close?.()
  })
})
</script>

<template>
  <div class="gaze-app">
    <h2>Определение направления взгляда</h2>

    <!-- Панель управления -->
    <div class="controls">
      <button @click="calibrate">Калибровать (смотреть в центр)</button>
    </div>

    <!-- Метрики -->
    <div class="metrics">
      <!-- Лицо -->
      <div class="metric" :class="faceDetected ? 'ok' : 'bad'">
        <span class="metric-label">Лицо:</span>
        <strong class="metric-value">
          {{ faceDetected ? '✅ На экране' : '❌ Не найдено' }}
        </strong>
      </div>

      <!-- Глаза -->
      <div class="metric" :class="eyeStatusClass">
        <span class="metric-label">Глаза:</span>
        <strong class="metric-value">{{ eyeStatusText }}</strong>
      </div>

      <!-- Взгляд -->
      <div class="metric" :class="gazeClass">
        <span class="metric-label">Взгляд:</span>
        <strong class="metric-value">{{ gazeText }}</strong>
      </div>

      <!-- Координаты -->
      <div class="metric neutral ratio">
        <span class="metric-label">h/v:</span>
        <strong class="metric-value">
          {{ gazeRatio.h.toFixed(3) }} / {{ gazeRatio.v.toFixed(3) }}
        </strong>
      </div>

      <!-- Статус калибровки -->
      <div class="metric" :class="isCalibrated ? 'ok' : 'warn'">
        <span class="metric-label">Калибровка:</span>
        <strong class="metric-value">
          {{ isCalibrated ? '✓' : '⚠ нажмите кнопку' }}
        </strong>
      </div>
    </div>

    <!-- Видео + canvas -->
    <div class="video-container">
      <video ref="videoRef" autoPlay playsInline class="video" />
      <canvas ref="canvasRef" class="overlay" />
    </div>
  </div>
</template>

<style scoped>
.gaze-app {
  max-width: 640px;
  margin: 0 auto;
  font-family: system-ui, -apple-system, sans-serif;
}

h2 {
  margin-bottom: 12px;
}

.controls {
  margin-bottom: 12px;
}

button {
  padding: 8px 16px;
  background: #00aa66;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  font-size: 14px;
  transition: background 0.15s;
}
button:hover {
  background: #00cc77;
}

/* === Метрики === */
.metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.metric {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  background: #f0f0f0;
  color: #333;
  transition: background 0.2s, color 0.2s;
  white-space: nowrap;
}
.metric .metric-label {
  color: #666;
}
.metric .metric-value {
  font-weight: 700;
}
.metric.ratio .metric-value {
  font-family: monospace;
  font-size: 12px;
}

.metric.ok { background: #d4f5e2; color: #006633; }
.metric.ok .metric-label { color: #008855; }

.metric.warn { background: #fff3cd; color: #8a6100; }
.metric.warn .metric-label { color: #aa7a00; }

.metric.bad { background: #ffe5e5; color: #aa0000; }
.metric.bad .metric-label { color: #cc3333; }

.metric.neutral { background: #f0f0f0; color: #555; }

/* === Видео === */
.video-container {
  position: relative;
  width: 100%;
  max-width: 640px;
  border-radius: 8px;
  overflow: hidden;
  background: #000;
}

.video {
  width: 100%;
  display: block;
  transform: scaleX(-1);
}

.overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  transform: scaleX(-1);
}
</style>
