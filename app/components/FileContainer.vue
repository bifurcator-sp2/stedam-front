<!-- components/FileContainer.vue -->
<script setup lang="ts">

import type {
  FilesListResponse,
  ImageItem,
  FileItem,
  StoredImage,
  StoredFile,
  TempFile,
} from '~/types/files'

import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'

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
// Модель: список файлов (двусторонняя связь с родителем)
// ============================================================

const files = defineModel<FilesListResponse>('files', {
  default: () => ({
    temp: {images: [], files: []},
    stored: {images: [], files: []},
  }),
})

const listLoading = ref(false)

// ============================================================
// Логи
// ============================================================

const DEBUG = true

function log(...args: unknown[]) {
  if (DEBUG) console.log('[FileContainer]', ...args)
}

function warn(...args: unknown[]) {
  if (DEBUG) console.warn('[FileContainer]', ...args)
}

// ============================================================
// Внутреннее состояние
// ============================================================

const uploading = ref(false)
const processingCrop = ref(false)
const denyPulse = ref(false)
const isDragging = ref(false)

const cropQueue = ref<File[]>([])
const activeCrop = ref<{ file: File; url: string } | null>(null)
const selectedRatio = ref<string>('1x1')

const cropImageRef = ref<HTMLImageElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
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

const hintText = computed(() => {
  if (props.fileType === 'image') return 'Изображения JPG, PNG, WebP'
  if (props.fileType === 'file') return 'PDF или ZIP'
  return 'Изображения или документы'
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
        {type: 'image/jpeg', lastModified: Date.now()},
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
// Загрузка списка — пишет в модель
// ============================================================

async function refresh() {
  listLoading.value = true
  try {
    const res = await api.get<FilesListResponse>(
      `/files/preload/${props.modelName}/${props.modelId}`,
    )
    files.value = res
  } finally {
    listLoading.value = false
  }
}

onMounted(refresh)

watch(
  () => [props.modelName, props.modelId],
  () => {
    refresh()
  },
)

// ============================================================
// Выбор файлов (input)
// ============================================================

async function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const list = Array.from(input.files ?? [])
  input.value = ''
  await processFiles(list)
}

// ============================================================
// Drag & drop
// ============================================================

async function onDrop(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false

  const dt = event.dataTransfer
  if (!dt) return

  const list = Array.from(dt.files ?? [])
  await processFiles(list)
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (uploading.value) return
  isDragging.value = true
}

function onDragLeave(event: DragEvent) {
  const target = event.currentTarget as HTMLElement
  const related = event.relatedTarget as Node | null
  if (related && target.contains(related)) return
  isDragging.value = false
}

function openFileDialog() {
  if (uploading.value) return
  fileInputRef.value?.click()
}

// ============================================================
// Общая обработка файлов
// ============================================================

async function processFiles(list: File[]) {
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
    try {
      cropperInstance.destroy()
    } catch (e) { /* ignore */
    }
    cropperInstance = null
  }
}

function applyAspectRatio(aspect: number) {
  if (!cropperInstance) return
  cropperInstance.setAspectRatio(aspect)
  log('applyAspectRatio', {aspect})
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
// Инициализация кроппера (v1)
// ============================================================

async function initCropper() {
  if (cropperInitializing) return
  cropperInitializing = true

  const myUrl = activeCrop.value?.url ?? ''
  currentInitUrl = myUrl

  try {
    destroyCropper()

    await nextTick()
    await nextTick()

    const img = cropImageRef.value
    if (!img) return

    await waitForImageReady(img)

    if (currentInitUrl !== myUrl) return

    if (!img.naturalWidth || !img.naturalHeight) {
      warn('ABORT: изображение без размеров')
      return
    }

    const wrap = img.parentElement
    if (!wrap) return

    const hasSize = await waitForWrapSize(wrap)
    if (!hasSize) {
      warn('ABORT: .cropper-wrap без размеров')
      return
    }

    if (currentInitUrl !== myUrl) return

    cropperInstance = new Cropper(img, {
      viewMode: 1,
      dragMode: 'move',
      aspectRatio: selectedRatioValue.value,
      autoCropArea: 1,
      responsive: true,
      background: false,
      modal: false,
      guides: true,
      center: false,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      ready() {
        log('cropper ready (v1)')
      },
    })

    log('cropper initialized (v1)', {
      aspectRatio: selectedRatioValue.value,
    })

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

    const canvas = cropperInstance.getCroppedCanvas({
      maxWidth: 4096,
      maxHeight: 4096,
      fillColor: '#fff',
    })

    if (!canvas) return

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9)
    })

    const croppedFile = new File(
      [blob],
      fileForCrop.name.replace(/\.\w+$/, '.jpg'),
      {type: 'image/jpeg'},
    )

    await uploadFiles([croppedFile], selectedRatio.value)
  } finally {
    processingCrop.value = false
    await showNextCrop()
  }
}

async function skipCrop() {
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

    // Обновляем модель — родитель увидит новый список
    await refresh()
  } finally {
    uploading.value = false
  }
}

// ============================================================
// Удаление файлов (temp )
// ============================================================
// ============================================================
// Удаление файлов
// ============================================================

async function removeFile(item: ImageItem | FileItem) {
  if (item.source === 'temp') {
    // temp — сразу удаляем с бэка и элемент исчезает из списка
    await removeTempFile(item.url)
    return
  }

  // stored — помечаем на удаление. Физически удалится при save().
  item.toDelete = true
}

function restoreFile(item: ImageItem | FileItem) {
  item.toDelete = false
}

async function removeTempFile(url: string) {
  await api.delete(`/files/preload/${props.modelName}/${props.modelId}`, {
    body: { url },
  })
  await refresh()
}

function removeFromModel(url: string) {
  const current = files.value

  const filterOut = <T extends { url: string }>(list: T[] | undefined): T[] =>
    (list ?? []).filter((item) => item.url !== url)

  files.value = {
    images: filterOut(current.images),
    files:  filterOut(current.files),
    temp: {
      images: filterOut(current.temp?.images),
      files:  filterOut(current.temp?.files),
    },
    stored: {
      images: filterOut(current.stored?.images),
      files:  filterOut(current.stored?.files),
    },
  }
}

// Публичные методы для родителя
function getFiles(): FilesListResponse {
  return files.value
}

// Публичные методы для родителя
defineExpose({
  refresh,
  removeTempFile,
  removeFile,
  restoreFile,
  getFiles,
})

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
// Событие наружу (для обратной совместимости)
// ============================================================

const emit = defineEmits<{
  (e: 'stored-change', payload: { images: StoredImage[]; files: StoredFile[] }): void
}>()

watch(() => files.value.stored, (val) => {
  emit('stored-change', val)
}, {deep: true})
</script>

<template>
  <div class="file-container">
    <!-- ==================== Dropzone ==================== -->
    <div class="dropzone">
      <input
        ref="fileInputRef"
        type="file"
        multiple
        :accept="accept"
        :disabled="uploading"
        class="dropzone__input"
        @change="onFilesSelected"
      />

      <div
        class="dropzone__area"
        :class="{
          'dropzone__area--active': isDragging,
          'dropzone__area--disabled': uploading,
        }"
        role="button"
        tabindex="0"
        @click="openFileDialog"
        @keydown.enter.prevent="openFileDialog"
        @keydown.space.prevent="openFileDialog"
        @dragover="onDragOver"
        @dragenter.prevent="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <UIcon name="i-lucide-cloud-upload" class="dropzone__icon"/>

        <div class="dropzone__text">
          <span class="dropzone__title">
            {{ isDragging ? 'Отпустите файлы здесь' : 'Перетащите файлы или нажмите' }}
          </span>
          <span class="dropzone__hint">{{ hintText }}</span>
        </div>
      </div>

      <div v-if="uploading" class="dropzone__uploading">
        <UIcon name="i-lucide-loader-2" class="dropzone__spinner"/>
        <span>Загрузка…</span>
      </div>
    </div>

    <!-- ==================== Модалка кропа ==================== -->
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
/* ==================== Dropzone ==================== */

.file-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dropzone {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dropzone__input {
  display: none;
}

.dropzone__area {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border: 1.5px dashed var(--ui-border, #d1d5db);
  border-radius: 10px;
  background: var(--ui-bg-elevated, #f9fafb);
  cursor: pointer;
  transition: border-color 0.15s ease,
  background 0.15s ease,
  transform 0.15s ease;
  user-select: none;
}

.dropzone__area:hover {
  border-color: var(--ui-primary, #3b82f6);
  background: var(--ui-bg, #ffffff);
}

.dropzone__area:focus-visible {
  outline: 2px solid var(--ui-primary, #3b82f6);
  outline-offset: 2px;
}

.dropzone__area--active {
  border-color: var(--ui-primary, #3b82f6);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--ui-primary, #3b82f6) 10%, transparent),
    color-mix(in srgb, var(--ui-primary, #3b82f6) 4%, transparent)
  );
  transform: scale(1.01);
}

.dropzone__area--active .dropzone__icon {
  color: var(--ui-primary, #3b82f6);
  transform: translateY(-2px);
}

.dropzone__area--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.dropzone__icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  color: var(--ui-text-muted, #9ca3af);
  transition: color 0.15s ease, transform 0.15s ease;
}

.dropzone__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dropzone__title {
  font-size: 14px;
  font-weight: 500;
  color: var(--ui-text, #111827);
}

.dropzone__hint {
  font-size: 12px;
  color: var(--ui-text-muted, #6b7280);
}

.dropzone__uploading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ui-text-muted, #6b7280);
}

.dropzone__spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* ==================== Модалка кропа ==================== */

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
  0%, 100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-4px);
  }
  75% {
    transform: translateX(4px);
  }
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
