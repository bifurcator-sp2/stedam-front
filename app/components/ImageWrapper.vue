<!-- components/ImageWrapper.vue -->
<script setup lang="ts">
import type { ImageItem } from '~/types/files'

const props = withDefaults(defineProps<{
  item: ImageItem
  /** Полный список картинок, по которым можно листать стрелками. */
  siblings?: ImageItem[]
  /** Показывать ли бейдж «Черновик» для source === 'temp'. */
  showDraft?: boolean
  /** Разрешить перетаскивание за иконку. */
  allowDragAndDrop?: boolean
}>(), {
  siblings: () => [],
  showDraft: true,
  allowDragAndDrop: true,
})

const emit = defineEmits<{
  (e: 'remove', item: ImageItem): void
  (e: 'restore', item: ImageItem): void
  (e: 'reorder', from: number, to: number): void
}>()

// ============================================================
// Помечен на удаление
// ============================================================

const isToDelete = computed(() => props.item.toDelete === true)

// ============================================================
// Черновик
// ============================================================

const isDraft = computed(
  () => !isToDelete.value && props.showDraft && props.item.source === 'temp',
)

// ============================================================
// Drag & drop
// ============================================================

const isDragOver = ref(false)

const myIndex = computed(() => {
  const list = props.siblings ?? []
  return list.findIndex((i) => i.url === props.item.url)
})

function onDragStart(e: DragEvent) {
  if (!props.allowDragAndDrop) return
  if (myIndex.value < 0) return

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(myIndex.value))
  }
}

function onDragOver(e: DragEvent) {
  if (!props.allowDragAndDrop) return
  if (myIndex.value < 0) return

  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  isDragOver.value = true
}

function onDragLeave() {
  isDragOver.value = false
}

function onDrop(e: DragEvent) {
  if (!props.allowDragAndDrop) return

  e.preventDefault()
  isDragOver.value = false

  const raw = e.dataTransfer?.getData('text/plain') ?? ''
  const from = Number(raw)

  if (!Number.isFinite(from)) return
  if (from === myIndex.value) return
  if (myIndex.value < 0) return

  emit('reorder', from, myIndex.value)
}

function onDragEnd() {
  isDragOver.value = false
}

// ============================================================
// Лайтбокс
// ============================================================

const lightboxOpen = ref(false)
const lightboxIndex = ref(0)

const gallery = computed<ImageItem[]>(() => {
  if (props.siblings?.length) return props.siblings
  return [props.item]
})

const current = computed<ImageItem | null>(() => {
  return gallery.value[lightboxIndex.value] ?? null
})

const hasPrev = computed(() => lightboxIndex.value > 0)
const hasNext = computed(() => lightboxIndex.value < gallery.value.length - 1)

const canNavigate = computed(() => gallery.value.length > 1)

function openLightbox() {
  if (isToDelete.value) return

  const idx = gallery.value.findIndex((i) => i.url === props.item.url)
  lightboxIndex.value = idx >= 0 ? idx : 0
  lightboxOpen.value = true
}

function closeLightbox() {
  lightboxOpen.value = false
}

function prev() {
  if (hasPrev.value) lightboxIndex.value--
}

function next() {
  if (hasNext.value) lightboxIndex.value++
}

// ============================================================
// Esc + блокировка скролла
// ============================================================

function onKeydown(e: KeyboardEvent) {
  if (!lightboxOpen.value) return

  if (e.key === 'Escape') {
    e.preventDefault()
    closeLightbox()
    return
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prev()
    return
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    next()
  }
}

watch(lightboxOpen, (open) => {
  if (!import.meta.client) return
  document.body.style.overflow = open ? 'hidden' : ''
})

onMounted(() => {
  if (import.meta.client) {
    window.addEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  if (import.meta.client) {
    window.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = ''
  }
})

// ============================================================
// Удаление / восстановление
// ============================================================

function onRemoveClick(e: MouseEvent) {
  e.stopPropagation()
  emit('remove', props.item)
}

function onRestoreClick(e: MouseEvent) {
  e.stopPropagation()
  emit('restore', props.item)
}
</script>

<template>
  <div
    class="image-wrapper"
    :class="{
      'image-wrapper--to-delete': isToDelete,
      'image-wrapper--drag-over': isDragOver && allowDragAndDrop,
    }"
    @dragover="onDragOver"
    @dragenter.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @dragend="onDragEnd"
  >
    <!-- Слот с картинкой -->
    <div class="image-wrapper__content" @click="openLightbox">
      <slot />
    </div>

    <!-- Бейдж «Черновик» -->
    <div
      v-if="isDraft"
      class="image-wrapper__draft"
      title="Черновик"
    >
      <UIcon name="i-lucide-pencil-line" class="image-wrapper__draft-icon" />
      <span class="image-wrapper__draft-text">Черновик</span>
    </div>

    <!-- Drag handle -->
    <div
      v-if="allowDragAndDrop && !isToDelete"
      class="image-wrapper__drag"
      draggable="true"
      title="Перетащить"
      @dragstart="onDragStart"
      @click.stop
    >
      <UIcon name="i-lucide-grip-vertical" />
    </div>

    <!-- Крестик удаления -->
    <button
      v-if="!isToDelete"
      type="button"
      class="image-wrapper__remove"
      aria-label="Удалить"
      @click="onRemoveClick"
    >
      <UIcon name="i-lucide-x" />
    </button>

    <!-- Оверлей «на удаление» -->
    <div v-if="isToDelete" class="image-wrapper__overlay">
      <button
        type="button"
        class="image-wrapper__restore"
        aria-label="Восстановить"
        @click="onRestoreClick"
      >
        <UIcon name="i-lucide-rotate-ccw" />
        <span>Восстановить</span>
      </button>
    </div>
  </div>

  <!-- Лайтбокс -->
  <ClientOnly>
    <Teleport to="body">
      <Transition name="iw-lightbox-fade">
        <div
          v-if="lightboxOpen && current"
          class="iw-lightbox"
          @click.self="closeLightbox"
        >
          <div class="iw-lightbox__inner" @click.self="closeLightbox">
            <div v-if="canNavigate" class="iw-lightbox__counter">
              {{ lightboxIndex + 1 }} / {{ gallery.length }}
            </div>

            <button
              type="button"
              class="iw-lightbox__close"
              aria-label="Закрыть"
              @click="closeLightbox"
            >
              <UIcon name="i-lucide-x" />
            </button>

            <button
              v-if="hasPrev"
              type="button"
              class="iw-lightbox__nav iw-lightbox__nav--prev"
              aria-label="Предыдущая"
              @click.stop="prev"
            >
              <UIcon name="i-lucide-chevron-left" />
            </button>

            <div class="iw-lightbox__media" @click.stop>
              <img
                :src="current.url"
                :alt="current.title ?? ''"
                class="iw-lightbox__img"
                @click="closeLightbox"
              />
              <div v-if="current.title" class="iw-lightbox__caption">
                {{ current.title }}
              </div>
            </div>

            <button
              v-if="hasNext"
              type="button"
              class="iw-lightbox__nav iw-lightbox__nav--next"
              aria-label="Следующая"
              @click.stop="next"
            >
              <UIcon name="i-lucide-chevron-right" />
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
/* ==================== Обёртка ==================== */

.image-wrapper {
  position: relative;
  display: inline-block;
  line-height: 0;
  align-self: flex-start;
  flex: 0 0 auto;
  vertical-align: top;
  transition: outline-color 0.15s ease;
}

.image-wrapper--drag-over {
  outline: 2px dashed var(--ui-primary, #3b82f6);
  outline-offset: 2px;
  border-radius: 6px;
}

.image-wrapper__content {
  display: block;
  cursor: zoom-in;
  line-height: 0;
  font-size: 0;
}

.image-wrapper--to-delete .image-wrapper__content {
  cursor: default;
}

/* Крестик и бейдж — поверх картинки */

.image-wrapper__draft {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.92);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.6;
  pointer-events: none;
  user-select: none;
  opacity: 0.9;
}

.image-wrapper__draft-icon {
  width: 12px;
  height: 12px;
}

.image-wrapper__draft-text {
  letter-spacing: 0.02em;
}

/* Drag handle */

.image-wrapper__drag {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: rgba(17, 24, 39, 0.65);
  color: #fff;
  cursor: grab;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.image-wrapper__drag:active {
  cursor: grabbing;
}

.image-wrapper:hover .image-wrapper__drag,
.image-wrapper:focus-within .image-wrapper__drag {
  opacity: 1;
}

.image-wrapper__drag:hover {
  background: rgba(17, 24, 39, 0.85);
}

.image-wrapper__drag :deep(svg) {
  width: 14px;
  height: 14px;
}

/* Сдвигаем бейдж «Черновик» вправо, если есть drag handle */
.image-wrapper__drag ~ .image-wrapper__draft {
  left: 34px;
}

.image-wrapper__remove {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(17, 24, 39, 0.7);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.image-wrapper:hover .image-wrapper__remove,
.image-wrapper:focus-within .image-wrapper__remove {
  opacity: 1;
}

.image-wrapper__remove:hover {
  background: #dc2626;
  transform: scale(1.06);
}

.image-wrapper__remove :deep(svg) {
  width: 14px;
  height: 14px;
}

/* Оверлей «на удаление» */

.image-wrapper__overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(107, 114, 128, 0.6);
  backdrop-filter: grayscale(1);
}

.image-wrapper__restore {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  white-space: nowrap;
}

.image-wrapper__restore:hover {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.6);
  transform: scale(1.03);
}

.image-wrapper__restore :deep(svg) {
  width: 14px;
  height: 14px;
}

/* ==================== Лайтбокс ==================== */

.iw-lightbox {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  padding: 32px;
}

.iw-lightbox__inner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.iw-lightbox__counter {
  position: absolute;
  top: 0;
  left: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.6;
  pointer-events: none;
}

.iw-lightbox__close {
  position: absolute;
  top: 0;
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}

.iw-lightbox__close:hover {
  background: rgba(255, 255, 255, 0.22);
  transform: scale(1.06);
}

.iw-lightbox__close :deep(svg) {
  width: 20px;
  height: 20px;
}

.iw-lightbox__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}

.iw-lightbox__nav:hover {
  background: rgba(255, 255, 255, 0.24);
}

.iw-lightbox__nav--prev {
  left: 0;
}

.iw-lightbox__nav--next {
  right: 0;
}

.iw-lightbox__nav :deep(svg) {
  width: 26px;
  height: 26px;
}

.iw-lightbox__media {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 100%;
  max-height: 100%;
  min-width: 0;
  min-height: 0;
}

.iw-lightbox__img {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 120px);
  width: auto;
  height: auto;
  object-fit: contain;
  user-select: none;
}

.iw-lightbox__caption {
  max-width: 720px;
  padding: 0 16px;
  color: #fff;
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
  opacity: 0.85;
  overflow-wrap: anywhere;
}

/* ==================== Transition ==================== */

.iw-lightbox-fade-enter-active,
.iw-lightbox-fade-leave-active {
  transition: opacity 0.18s ease;
}

.iw-lightbox-fade-enter-from,
.iw-lightbox-fade-leave-to {
  opacity: 0;
}
</style>
