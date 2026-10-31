<!-- app/components/video/Calibrate.vue -->
<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { useToast } from '#imports'

const toast = useToast()

const isOpen = ref(false)
const isLoading = ref(false)
const isCalibrating = ref(false)
const gazePoint = ref({ x: -100, y: -100 })
const calibrationProgress = ref(0)

let webgazerInstance: any = null

// ==================== Сглаживание ====================
let targetX = -100
let targetY = -100
let currentX = -100
let currentY = -100
let animFrameId: number | null = null

// Коэффициент сглаживания (от 0.01 до 1.0)
const SMOOTHING = 0.15
// Если прыжок больше этого значения (моргнул/отвернулся), телепортируем
const JUMP_THRESHOLD = 400

function animateGaze() {
  if (!isOpen.value) return

  if (targetX > 0 && targetY > 0) {
    currentX = currentX + SMOOTHING * (targetX - currentX)
    currentY = currentY + SMOOTHING * (targetY - currentY)

    gazePoint.value = { x: currentX, y: currentY }
  }

  animFrameId = requestAnimationFrame(animateGaze)
}

// ==================== Инициализация ====================

const CALIBRATION_POINTS = [
  { id: 1, x: 10, y: 10 }, { id: 2, x: 50, y: 10 }, { id: 3, x: 90, y: 10 },
  { id: 4, x: 10, y: 50 }, { id: 5, x: 50, y: 50 }, { id: 6, x: 90, y: 50 },
  { id: 7, x: 10, y: 90 }, { id: 8, x: 50, y: 90 }, { id: 9, x: 90, y: 90 }
]
const clickedPoints = ref<Set<number>>(new Set())

function loadWebGazer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).webgazer) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = '/app/libs/webgazer/webgazer.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Не удалось загрузить WebGazer.js'))
    document.head.appendChild(script)
  })
}

async function openModal() {
  isOpen.value = true
  isLoading.value = true
  clickedPoints.value.clear()
  calibrationProgress.value = 0
  isCalibrating.value = false
  gazePoint.value = { x: -100, y: -100 }

  try {
    await loadWebGazer()
    webgazerInstance = (window as any).webgazer

    // ВАЖНО: Указываем путь к файлам MediaPipe
    webgazerInstance.params.faceMeshSolutionPath = '/app/libs/webgazer/mediapipe/face_mesh'

    // Скрываем стандартные элементы WebGazer
    webgazerInstance.showVideoPreview(false)
    webgazerInstance.showFaceOverlay(false)
    webgazerInstance.showFaceFeedbackBox(false)
    webgazerInstance.params.showGazeDot = false

    // Загружаем сохраненную калибровку
    const saved = localStorage.getItem('video_calibration')
    if (saved) {
      try {
        const regression = JSON.parse(saved)
        if (regression) {
          webgazerInstance.setRegression(regression)
        }
      } catch (e) {
        console.warn('Не удалось загрузить сохраненную калибровку', e)
      }
    }

    // Получаем сырые данные
    webgazerInstance.setGazeListener((data: any) => {
      if (data == null) return

      // При резком скачке телепортируем
      if (Math.abs(data.x - targetX) > JUMP_THRESHOLD || Math.abs(data.y - targetY) > JUMP_THRESHOLD) {
        currentX = data.x
        currentY = data.y
      }

      targetX = data.x
      targetY = data.y
    })

    await webgazerInstance.begin()
    isLoading.value = false
    isCalibrating.value = true

    // Запускаем цикл анимации
    if (animFrameId) cancelAnimationFrame(animFrameId)
    animateGaze()

  } catch (e) {
    console.error(e)
    toast.add({
      title: 'Ошибка',
      description: 'Не удалось запустить камеру или загрузить скрипт WebGazer',
      color: 'error'
    })
    isOpen.value = false
    isLoading.value = false
  }
}

function onCalibrationClick(e: MouseEvent, id: number) {
  if (!webgazerInstance) return

  webgazerInstance.recordScreenPosition(e.clientX, e.clientY, 'click')

  if (!clickedPoints.value.has(id)) {
    clickedPoints.value.add(id)
    calibrationProgress.value++
  }
}

function closeModal() {
  if (!isOpen.value) return
  isOpen.value = false
  isCalibrating.value = false

  if (animFrameId) {
    cancelAnimationFrame(animFrameId)
    animFrameId = null
  }

  if (webgazerInstance) {
    try {
      const regression = webgazerInstance.getRegression()
      if (regression) {
        localStorage.setItem('video_calibration', JSON.stringify(regression))
      }
    } catch (e) {
      console.error('Ошибка при сохранении калибровки', e)
    }

    webgazerInstance.clearGazeListener()
    webgazerInstance.end()
    webgazerInstance = null
  }
}

const handleOpenUpdate = (val: boolean) => {
  if (!val) closeModal()
}

onBeforeUnmount(() => {
  closeModal()
})
</script>

<template>
  <div>
    <UButton
      @click="openModal"
      icon="i-lucide-scan-face"
      color="primary"
      size="md"
    >
      Калибровка камеры
    </UButton>

    <UModal
      :open="isOpen"
      @update:open="handleOpenUpdate"
      :ui="{
        content: 'sm:max-w-none w-[90vw] h-[90vh]',
        body: 'p-0 overflow-hidden relative h-full w-full'
      }"
    >
      <template #body>
        <div class="relative w-full h-full bg-slate-50 dark:bg-slate-900 overflow-hidden">

          <div
            v-if="isLoading"
            class="absolute inset-0 flex flex-col items-center justify-center gap-4 z-50 bg-slate-50/90 dark:bg-slate-900/90"
          >
            <UIcon name="i-lucide-loader-2" class="w-10 h-10 animate-spin text-primary" />
            <p class="text-lg font-medium">Запуск камеры...</p>
          </div>

          <div v-else-if="isCalibrating" class="relative w-full h-full">

            <button
              v-for="pt in CALIBRATION_POINTS"
              :key="pt.id"
              class="absolute w-10 h-10 -ml-5 -mt-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center cursor-pointer z-10 shadow-sm"
              :class="clickedPoints.has(pt.id)
                ? 'border-green-500 bg-green-500/20 scale-90 cursor-default'
                : 'border-red-500 bg-red-500/20 hover:scale-110 hover:bg-red-500/40'"
              :style="{ left: pt.x + '%', top: pt.y + '%' }"
              @click.stop="onCalibrationClick($event, pt.id)"
            >
              <div
                class="w-2.5 h-2.5 rounded-full transition-colors"
                :class="clickedPoints.has(pt.id) ? 'bg-green-500' : 'bg-red-500'"
              ></div>
            </button>

            <!-- Прицел (плавный) -->
            <div
              v-if="gazePoint.x > 0"
              class="fixed pointer-events-none z-[9999] will-change-transform"
              :style="{
                transform: `translate3d(${gazePoint.x}px, ${gazePoint.y}px, 0)`
              }"
            >
              <div class="relative -translate-x-1/2 -translate-y-1/2">
                <UIcon
                  name="i-lucide-crosshair"
                  class="w-12 h-12 text-primary drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)] opacity-80"
                />
              </div>
            </div>

            <div
              class="absolute top-6 left-1/2 -translate-x-1/2 bg-black/75 backdrop-blur-md text-white px-6 py-3 rounded-xl pointer-events-none z-20 shadow-lg flex items-center gap-3"
            >
              <UIcon name="i-lucide-info" class="w-5 h-5 text-primary" />
              <span class="text-base font-medium">
                Смотрите прямо на точки и кликайте по ним ({{ calibrationProgress }} / 9)
              </span>
            </div>
          </div>

        </div>
      </template>
    </UModal>
  </div>
</template>
