<!-- components/FileContainer.vue -->
<script setup lang="ts">
import type { FilesListResponse, StoredImage, StoredFile, TempFile } from '~/types/files'
import Cropper from 'cropperjs'

const props = withDefaults(defineProps<{
  modelName: string
  modelId: number
  settings?: Record<string, any>
  fileType?: 'image' | 'file' | 'all'
  /** Запрещает пропускать/отменять этап кропа. По умолчанию true. */
  forceCrop?: boolean
}>(), {
  fileType: 'all',
  forceCrop: true,
})

const api = useApi()

const MAX_IMAGE_DIMENSION = 2000

// ============================================================
// Состояние
// ============================================================

const files = ref<FilesListResponse>({
  temp: { images: [], files: [] },
  stored: { images: [], files: [] },
})

const loading = ref(false)
const uploading = ref(false)
const processingCrop = ref(false)
const denyPulse = ref(false)

const cropQueue = ref<File[]>([])
const activeCrop = ref<{ file: File; url: string } | null>(null)
const selectedRatio = ref<string>('1x1')

const cropImageRef = ref<HTMLImageElement | null>(null)
let cropperInstance: Cropper | null = null

let cropperInitializing = false
let currentInitUrl: string | null = null

const rules = computed(() => props.settings ?? {
  imageMimes: ['image/jpeg', 'image/png', 'image/webp'],
  fileMimes: ['application/pdf', 'application/zip'],
  maxImages: 10,
  maxFiles: 10,
  maxSizeKb: 10240,
  ratios: ['1x1', '1x2', '1x3', '1x4', '2x1', '3x1', '4x1'],
})

const accept = computed(() => {
  if (props.fileType === 'image') return 'image/*'
  if (props.fileType === 'file') return '.pdf,.zip'
  return undefined
})

const selectedRatioValue = computed(() => {
  const [w, h] = selectedRatio.value.split('x').map(Number)
  return w / h
})

const isCropModalOpen = computed(() => !!activeCrop.value)

// ============================================================
// Визуальный отклик при запрете пропуска
// ============================================================

function flashDenied() {
  denyPulse.value = true
  setTimeout(() => (denyPulse.value = false), 260)
}

// ============================================================
// Предобработка изображения
// ============================================================

async function normalizeImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = async () => {
      URL.revokeObjectURL(url)

      const w = img.naturalWidth
      const h = img.naturalHeight

      if (w <= MAX_IMAGE_DIMENSION && h <= MAX_IMAGE_DIMENSION) {
        resolve(file)
        return
      }

      let newW = w
      let newH = h
      if (w > h) {
        newW = MAX_IMAGE_DIMENSION
        newH = Math.round(h * MAX_IMAGE_DIMENSION / w)
      } else {
        newH = MAX_IMAGE_DIMENSION
        newW = Math.round(w * MAX_IMAGE_DIMENSION / h)
      }

      const canvas = document.createElement('canvas')
      canvas.width = newW
      canvas.height = newH

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(file)
        return
      }

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, newW, newH)

      const blob = await new Promise<Blob | null>((res) => {
        canvas.toBlob((b) => res(b), 'image/jpeg', 0.9)
      })

      if (!blob) {
        resolve(file)
        return
      }

      const newFile = new File(
        [blob],
        file.name.replace(/\.\w+$/, '.jpg'),
        { type: 'image/jpeg', lastModified: Date.now() },
      )

      resolve(newFile)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }

    img.src = url
  })
}

// ============================================================
// Загрузка списка
// ============================================================

async function refresh() {
  loading.value = true
  try {
    files.value = await api.get<FilesListResponse>(
      `/files/preload/${props.modelName}/${props.modelId}`,
    )
  } finally {
    loading.value = false
  }
}

onMounted(refresh)

// ============================================================
// Выбор файлов
// ============================================================

async function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const list = Array.from(input.files ?? [])
  input.value = ''

  if (!list.length) return

  const plainFiles: File[] = []

  for (const file of list) {
    const isImage = file.type.startsWith('image/')
    const wantCrop = isImage && props.fileType !== 'file'

    if (wantCrop) {
      const normalized = await normalizeImage(file)
      cropQueue.value.push(normalized)
    } else {
      plainFiles.push(file)
    }
  }

  if (plainFiles.length) {
    await uploadFiles(plainFiles)
  }

  await showNextCrop()
}

// ============================================================
// Очередь кропа
// ============================================================

async function showNextCrop() {
  const next = cropQueue.value.shift()

  if (activeCrop.value?.url) {
    URL.revokeObjectURL(activeCrop.value.url)
  }

  if (!next) {
    activeCrop.value = null
    currentInitUrl = null
    destroyCropper()
    clearCropperDom()
    return
  }

  activeCrop.value = {
    file: next,
    url: URL.createObjectURL(next),
  }

  await nextTick()
  await nextTick()

  await initCropper()
}

// ============================================================
// Утилиты CropperJS
// ============================================================

function destroyCropper() {
  if (cropperInstance) {
    try { cropperInstance.destroy?.() } catch (e) { /* ignore */ }
    cropperInstance = null
  }
}

function clearCropperDom() {
  const wrap = cropImageRef.value?.parentElement
  if (!wrap) return

  wrap
    .querySelectorAll('cropper-canvas, cropper-image, cropper-selection, cropper-handle')
    .forEach((el) => el.remove())
}

function removeEdgeHandles() {
  if (!cropperInstance) return

  const selection = cropperInstance.getCropperSelection?.()
  if (!selection) return

  const edgeActions = ['n-resize', 'e-resize', 's-resize', 'w-resize']

  selection.querySelectorAll('cropper-handle').forEach((handle) => {
    const action = handle.getAttribute('action')
    if (action && edgeActions.includes(action)) {
      handle.remove()
    }
  })
}

function applyAspectRatio(aspect: number) {
  if (!cropperInstance) return

  const selection = cropperInstance.getCropperSelection?.()
  if (!selection) return

  selection.aspectRatio = aspect
  selection.initialAspectRatio = aspect

  const canvas = cropperInstance.getCropperCanvas?.() as HTMLCanvasElement | undefined
  if (!canvas) return

  const cw = canvas.width || canvas.clientWidth || 800
  const ch = canvas.height || canvas.clientHeight || 500

  let w = cw * 0.9
  let h = w / aspect
  if (h > ch * 0.9) {
    h = ch * 0.9
    w = h * aspect
  }

  const x = (cw - w) / 2
  const y = (ch - h) / 2

  selection.$change(x, y, w, h, aspect)

  selection.setAttribute('resizable', 'true')
  selection.setAttribute('movable', 'true')
  selection.setAttribute('precise', 'true')
}

// ============================================================
// Ожидание готовности изображения
// ============================================================

async function waitForImageReady(img: HTMLImageElement): Promise<void> {
  if (img.complete && img.naturalWidth > 0) return

  await new Promise<void>((resolve) => {
    if (img.complete && img.naturalWidth > 0) return resolve()
    img.onload = () => resolve()
    img.onerror = () => resolve()
  })

  if (typeof img.decode === 'function') {
    try {
      await img.decode()
    } catch (e) {
      // ignore
    }
  }
}

// ============================================================
// Ожидание ненулевых размеров обёртки
// ============================================================

async function waitForWrapSize(wrap: HTMLElement, maxMs = 1000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    if (wrap.clientWidth > 0 && wrap.clientHeight > 0) return true
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
  return false
}

// ============================================================
// Инициализация кроппера
// ============================================================

async function initCropper() {
  if (cropperInitializing) return
  cropperInitializing = true

  const myUrl = activeCrop.value?.url ?? ''
  currentInitUrl = myUrl

  try {
    destroyCropper()
    clearCropperDom()

    await nextTick()
    await nextTick()

    const img = cropImageRef.value
    if (!img) return

    await waitForImageReady(img)

    if (currentInitUrl !== myUrl) return

    if (!img.naturalWidth || !img.naturalHeight) {
      console.error('[initCropper] ABORT: изображение без размеров')
      return
    }

    await nextTick()
    await new Promise((r) => requestAnimationFrame(() => r(null)))

    const wrap = img.parentElement
    if (!wrap) return

    const hasSize = await waitForWrapSize(wrap)
    if (!hasSize) {
      console.error('[initCropper] ABORT: .cropper-wrap без размеров')
      return
    }

    if (currentInitUrl !== myUrl) return

    cropperInstance = new Cropper(img)

    await nextTick()
    await new Promise((r) => setTimeout(r, 100))

    const canvasEl = wrap.querySelector('cropper-canvas') as HTMLCanvasElement | null
    if (canvasEl) {
      const w = wrap.clientWidth || 800
      const h = wrap.clientHeight || 500

      canvasEl.setAttribute('width', String(w))
      canvasEl.setAttribute('height', String(h))
      canvasEl.style.width = `${w}px`
      canvasEl.style.height = `${h}px`
      canvasEl.style.display = 'block'

      canvasEl.setAttribute('background', 'false')
    }

    const image = cropperInstance.getCropperImage?.()
    if (image) {
      image.setAttribute('scalable', 'true')
      const centerFn = (image as any).$center
      if (typeof centerFn === 'function') {
        centerFn.call(image, 'contain')
      }
    }

    removeEdgeHandles()
    applyAspectRatio(selectedRatioValue.value)
  } finally {
    cropperInitializing = false
  }
}

// ============================================================
// Реакция на смену соотношения
// ============================================================

watch(selectedRatio, () => {
  applyAspectRatio(selectedRatioValue.value)
})

// ============================================================
// Модалка — блокировка скролла
// ============================================================

watch(isCropModalOpen, (open) => {
  if (import.meta.client) {
    document.body.style.overflow = open ? 'hidden' : ''
  }
})

// ============================================================
// Подтверждение / пропуск
// ============================================================

async function confirmCrop() {
  if (processingCrop.value) return
  processingCrop.value = true

  const fileForCrop = activeCrop.value?.file
  const urlForCrop = activeCrop.value?.url

  if (!fileForCrop || !urlForCrop) {
    processingCrop.value = false
    return
  }

  try {
    if (!cropperInstance) return

    const selection = cropperInstance.getCropperSelection?.()
    if (!selection) return

    const canvas: HTMLCanvasElement = await selection.$toCanvas()

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9)
    })

    const croppedFile = new File(
      [blob],
      fileForCrop.name.replace(/\.\w+$/, '.jpg'),
      { type: 'image/jpeg' },
    )

    await uploadFiles([croppedFile], selectedRatio.value)
  } finally {
    processingCrop.value = false
    await showNextCrop()
  }
}

async function skipCrop() {
  // forceCrop=true — блокируем, файл на сервер не уходит
  if (props.forceCrop) {
    flashDenied()
    return
  }

  if (processingCrop.value) return
  processingCrop.value = true

  const fileForCrop = activeCrop.value?.file

  try {
    if (fileForCrop) {
      await uploadFiles([fileForCrop], null)
    }
  } finally {
    processingCrop.value = false
    await showNextCrop()
  }
}

// ============================================================
// Загрузка на сервер
// ============================================================

async function uploadFiles(list: File[], ratio: string | null = null) {
  uploading.value = true
  try {
    const fd = new FormData()

    list.forEach((file) => {
      fd.append('files[]', file, file.name)
      fd.append('ratios[]', ratio ?? '')
    })

    await api.post(
      `/files/preload/${props.modelName}/${props.modelId}`,
      fd,
    )

    await refresh()
  } finally {
    uploading.value = false
  }
}

// ============================================================
// Удаление временных файлов
// ============================================================

async function removeTempFile(name: string) {
  await api.delete(`/files/preload/${props.modelName}/${props.modelId}`, {
    body: { name },
  })
  await refresh()
}

// ============================================================
// Escape
// ============================================================

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !isCropModalOpen.value) return

  if (props.forceCrop) {
    flashDenied()
    return
  }
  skipCrop()
}

onMounted(() => {
  if (import.meta.client) {
    window.addEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => {
  if (import.meta.client) {
    window.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = ''
  }
  destroyCropper()
  if (activeCrop.value?.url) URL.revokeObjectURL(activeCrop.value.url)
})

// ============================================================
// События наружу
// ============================================================

const emit = defineEmits<{
  (e: 'stored-change', payload: { images: StoredImage[]; files: StoredFile[] }): void
}>()

watch(() => files.value.stored, (val) => {
  emit('stored-change', val)
}, { deep: true })
</script>

<template>
  <div class="file-container">
    <input
      type="file"
      multiple
      :accept="accept"
      :disabled="uploading"
      @change="onFilesSelected"
    />

    <div v-if="uploading" class="uploading">Загрузка...</div>

    <section v-if="files.temp.images.length || files.temp.files.length" class="temp-section">
      <h4>Временные файлы</h4>

      <div v-for="img in files.temp.images" :key="img.name" class="file-item">
        <img :src="img.url" width="80" />
        <span>{{ img.name }}</span>
        <span v-if="img.ratio" class="badge">{{ img.ratio }}</span>
        <button @click="removeTempFile(img.name)">Удалить</button>
      </div>

      <div v-for="f in files.temp.files" :key="f.name" class="file-item">
        <span>{{ f.name }}</span>
        <button @click="removeTempFile(f.name)">Удалить</button>
      </div>
    </section>

    <section v-if="files.stored.images.length || files.stored.files.length" class="stored-section">
      <h4>Сохранённые файлы</h4>

      <div v-for="img in files.stored.images" :key="img.original" class="file-item">
        <img :src="img.thumbnail_url ?? img.original_url" width="80" />
        <span>{{ img.original }}</span>
        <span v-if="img.ratio" class="badge">{{ img.ratio }}</span>
      </div>

      <div v-for="f in files.stored.files" :key="f.name" class="file-item">
        <span>{{ f.name }}</span>
      </div>
    </section>

    <ClientOnly>
      <Teleport to="body">
        <Transition name="crop-modal-fade">
          <div
            v-if="activeCrop"
            class="crop-modal-backdrop"
            :class="{ 'crop-modal-backdrop--denied': denyPulse }"
            @click.self="forceCrop ? flashDenied() : skipCrop()"
          >
            <div
              class="crop-modal"
              :class="{ 'crop-modal--denied': denyPulse }"
              role="dialog"
              aria-modal="true"
            >
              <header class="crop-modal__header">
                <h3 class="crop-modal__title">
                  Обрезка: {{ activeCrop.file.name }}
                </h3>
                <button
                  v-if="!forceCrop"
                  type="button"
                  class="crop-modal__close"
                  aria-label="Закрыть"
                  @click="skipCrop"
                >
                  ×
                </button>
              </header>

              <div class="crop-modal__ratios">
                <button
                  v-for="r in rules.ratios"
                  :key="r"
                  type="button"
                  :class="['ratio-btn', { 'ratio-btn--active': selectedRatio === r }]"
                  @click="selectedRatio = r"
                >
                  {{ r }}
                </button>
              </div>

              <div class="crop-modal__body">
                <div class="cropper-wrap">
                  <img
                    :key="activeCrop.url"
                    ref="cropImageRef"
                    :src="activeCrop.url"
                    alt="crop"
                    class="cropper-image"
                  />
                </div>
              </div>

              <footer class="crop-modal__footer">
                <button
                  v-if="!forceCrop"
                  type="button"
                  class="btn btn--ghost"
                  :disabled="uploading || processingCrop"
                  @click="skipCrop"
                >
                  Пропустить
                </button>
                <button
                  type="button"
                  class="btn btn--primary"
                  :disabled="uploading || processingCrop"
                  @click="confirmCrop"
                >
                  {{ uploading ? 'Загрузка...' : 'Обрезать и загрузить' }}
                </button>
              </footer>
            </div>
          </div>
        </Transition>
      </Teleport>
    </ClientOnly>
  </div>
</template>

<style scoped>
.crop-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
  padding: 24px;
}

.crop-modal-backdrop--denied {
  animation: crop-shake 0.26s ease;
}

.crop-modal {
  display: flex;
  flex-direction: column;
  width: min(1100px, 100%);
  height: min(90vh, 800px);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.crop-modal--denied {
  animation: crop-shake 0.26s ease;
}

@keyframes crop-shake {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-4px); }
  75%      { transform: translateX(4px); }
}

.crop-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}

.crop-modal__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.crop-modal__close {
  border: none;
  background: transparent;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  color: #666;
}

.crop-modal__close:hover {
  color: #000;
}

.crop-modal__ratios {
  display: flex;
  gap: 6px;
  padding: 12px 20px;
  border-bottom: 1px solid #eee;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.ratio-btn {
  padding: 6px 12px;
  border: 1px solid #ccc;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.ratio-btn--active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.crop-modal__body {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  display: flex;
  padding: 0;
  background: #f5f5f5;
  overflow: hidden;
}

.cropper-wrap {
  position: relative;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.cropper-image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  opacity: 0;
  pointer-events: none;
}

.cropper-wrap :deep(cropper-canvas) {
  display: block;
}

.cropper-wrap :deep(cropper-image) {
  display: block;
}

.crop-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid #eee;
  flex-shrink: 0;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 14px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--ghost {
  background: #fff;
  border-color: #ccc;
}

.btn--primary {
  background: #2563eb;
  color: #fff;
}

.btn--primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.crop-modal-fade-enter-active,
.crop-modal-fade-leave-active {
  transition: opacity 0.15s ease;
}

.crop-modal-fade-enter-from,
.crop-modal-fade-leave-to {
  opacity: 0;
}
</style>
