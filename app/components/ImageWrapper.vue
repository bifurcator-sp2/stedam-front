<!-- components/ImageWrapper.vue -->
<script setup lang="ts">
import type { ImageItem } from '~/types/files'

const props = withDefaults(defineProps<{
  item: ImageItem
  siblings?: ImageItem[]
  showDraft?: boolean
  allowDragAndDrop?: boolean
  showToDelete?: boolean
  draggingIndex?: number | null
}>(), {
  siblings: () => [],
  showDraft: true,
  allowDragAndDrop: true,
  showToDelete: false,
  draggingIndex: null,
})

const emit = defineEmits<{
  (e: 'remove', item: ImageItem): void
  (e: 'restore', item: ImageItem): void
  (e: 'drag-start', index: number): void
  (e: 'drag-end'): void
  (e: 'drop-before', from: number, to: number): void
  (e: 'drop-after', from: number, to: number): void
}>()

// ============================================================
// Состояния
// ============================================================

const isToDelete = computed(
  () => props.showToDelete === true && props.item.toDelete === true,
)

const canRemove = computed(() => props.showToDelete === true)

const isDraft = computed(
  () => !isToDelete.value && props.showDraft && props.item.source === 'temp',
)

// ============================================================
// Drag & drop
// ============================================================

const dropSide = ref<'before' | 'after' | null>(null)

const myIndex = computed(() => {
  const list = props.siblings ?? []
  return list.findIndex((i) => i.url === props.item.url)
})

const isDropTarget = computed(() => {
  if (dropSide.value === null) return false
  if (props.draggingIndex === null) return false
  if (props.draggingIndex === myIndex.value) return false
  return true
})

const isDragSource = computed(
  () => props.draggingIndex !== null && props.draggingIndex === myIndex.value,
)

function onDragStart(e: DragEvent) {
  if (!props.allowDragAndDrop) return
  if (isToDelete.value) return
  if (myIndex.value < 0) return

  e.stopPropagation() // <-- Останавливаем всплытие

  emit('drag-start', myIndex.value)

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(myIndex.value))
  }
}

function onDragOver(e: DragEvent) {
  if (!props.allowDragAndDrop) return
  if (isToDelete.value) return
  if (myIndex.value < 0) return

  e.preventDefault()
  e.stopPropagation() // <-- Останавливаем всплытие

  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'

  const el = e.currentTarget as HTMLElement | null
  if (!el) {
    dropSide.value = 'after'
    return
  }

  const rect = el.getBoundingClientRect()
  const horizontal = rect.width > rect.height
  const isBefore = horizontal
    ? e.clientX < rect.left + rect.width / 2
    : e.clientY < rect.top + rect.height / 2

  dropSide.value = isBefore ? 'before' : 'after'
}

function onDragLeave() {
  dropSide.value = null
}

function onDrop(e: DragEvent) {
  if (!props.allowDragAndDrop) return

  e.preventDefault()
  e.stopPropagation() // <-- Останавливаем всплытие

  const side = dropSide.value
  dropSide.value = null

  if (!side || myIndex.value < 0) {
    emit('drag-end')
    return
  }

  const raw = e.dataTransfer?.getData('text/plain') ?? ''
  const from = Number(raw)
  if (!Number.isFinite(from)) {
    emit('drag-end')
    return
  }

  emit('drag-end')

  if (from === myIndex.value) return

  if (side === 'before') {
    emit('drop-before', from, myIndex.value)
  } else {
    emit('drop-after', from, myIndex.value)
  }
}

function onDragEnd() {
  dropSide.value = null
  emit('drag-end')
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
// Lifecycle & Events
// ============================================================

function onKeydown(e: KeyboardEvent) {
  if (!lightboxOpen.value) return

  if (e.key === 'Escape') {
    e.preventDefault()
    closeLightbox()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prev()
  } else if (e.key === 'ArrowRight') {
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
    class="group relative inline-block leading-none self-start flex-none align-top transition-all duration-150"
    :class="{
      'opacity-40': isDragSource,
      'pt-[10px]': isDropTarget && dropSide === 'before',
      'pb-[10px]': isDropTarget && dropSide === 'after',
    }"
    v-bind="$attrs"
    @dragover="onDragOver"
    @dragenter.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
    @dragend="onDragEnd"
  >
    <!-- Индикатор вставки (Верх/Лево) -->
    <div
      v-if="isDropTarget && dropSide === 'before'"
      class="absolute left-0 right-0 top-[3px] h-[3px] rounded-sm pointer-events-none z-[4] shadow-[0_0_0_3px_rgba(59,130,246,0.15)] bg-[radial-gradient(circle_4px_at_4px_50%,var(--ui-primary,#3b82f6)_100%,transparent_101%),radial-gradient(circle_4px_at_calc(100%-4px)_50%,var(--ui-primary,#3b82f6)_100%,transparent_101%),var(--ui-primary,#3b82f6)]"
    />

    <!-- Индикатор вставки (Низ/Право) -->
    <div
      v-if="isDropTarget && dropSide === 'after'"
      class="absolute left-0 right-0 bottom-[3px] h-[3px] rounded-sm pointer-events-none z-[4] shadow-[0_0_0_3px_rgba(59,130,246,0.15)] bg-[radial-gradient(circle_4px_at_4px_50%,var(--ui-primary,#3b82f6)_100%,transparent_101%),radial-gradient(circle_4px_at_calc(100%-4px)_50%,var(--ui-primary,#3b82f6)_100%,transparent_101%),var(--ui-primary,#3b82f6)]"
    />

    <!-- Слот с картинкой -->
    <div
      class="block cursor-zoom-in leading-none text-[0px]"
      :class="{ 'cursor-default': isToDelete }"
      @click="openLightbox"
    >
      <slot />
    </div>

    <!-- Бейдж «Черновик» -->
    <div
      v-if="isDraft"
      class="absolute top-1.5 z-[2] inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/90 text-white text-[11px] font-semibold leading-[1.6] pointer-events-none select-none opacity-90"
      :class="allowDragAndDrop && !isToDelete ? 'left-[34px]' : 'left-1.5'"
      title="Черновик"
    >
      <UIcon name="i-lucide-pencil-line" class="w-3 h-3" />
      <span class="tracking-[0.02em]">Черновик</span>
    </div>

    <!-- Drag handle -->
    <div
      v-if="allowDragAndDrop && !isToDelete"
      class="absolute top-1.5 left-1.5 z-[3] inline-flex items-center justify-center w-[22px] h-[22px] rounded bg-gray-900/65 text-white cursor-grab opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 hover:bg-gray-900/85 active:cursor-grabbing"
      draggable="true"
      title="Перетащить"
      @dragstart="onDragStart"
      @click.stop
    >
      <UIcon name="i-lucide-grip-vertical" class="w-3.5 h-3.5" />
    </div>

    <!-- Крестик удаления -->
    <button
      v-if="canRemove && !isToDelete"
      type="button"
      class="absolute top-1.5 right-1.5 z-[2] inline-flex items-center justify-center w-6 h-6 p-0 border-none rounded-full bg-gray-900/70 text-white cursor-pointer opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all duration-150 hover:bg-red-600 hover:scale-105"
      aria-label="Удалить"
      @click="onRemoveClick"
    >
      <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
    </button>

    <!-- Оверлей «на удаление» -->
    <div v-if="isToDelete" class="absolute inset-0 z-[3] flex items-center justify-center bg-gray-500/60 backdrop-grayscale">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-white/40 rounded-full bg-white/15 text-white text-[13px] font-medium leading-none cursor-pointer transition-all duration-150 hover:bg-white/25 hover:border-white/60 hover:scale-105 whitespace-nowrap"
        aria-label="Восстановить"
        @click="onRestoreClick"
      >
        <UIcon name="i-lucide-rotate-ccw" class="w-3.5 h-3.5" />
        <span>Восстановить</span>
      </button>
    </div>
  </div>

  <!-- Лайтбокс -->
  <ClientOnly>
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        leave-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
      >
        <div
          v-if="lightboxOpen && current"
          class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-8"
          @click.self="closeLightbox"
        >
          <div class="relative flex items-center justify-center w-full h-full min-w-0 min-h-0" @click.self="closeLightbox">

            <div v-if="canNavigate" class="absolute top-0 left-0 px-2.5 py-1 rounded-full bg-white/10 text-white text-xs font-medium leading-[1.6] pointer-events-none">
              {{ lightboxIndex + 1 }} / {{ gallery.length }}
            </div>

            <button
              type="button"
              class="absolute top-0 right-0 inline-flex items-center justify-center w-9 h-9 p-0 border-none rounded-full bg-white/10 text-white cursor-pointer transition-all duration-150 hover:bg-white/20 hover:scale-105"
              aria-label="Закрыть"
              @click="closeLightbox"
            >
              <UIcon name="i-lucide-x" class="w-5 h-5" />
            </button>

            <button
              v-if="hasPrev"
              type="button"
              class="absolute top-1/2 -translate-y-1/2 left-0 inline-flex items-center justify-center w-12 h-12 p-0 border-none rounded-full bg-white/10 text-white cursor-pointer transition-all duration-150 hover:bg-white/20"
              aria-label="Предыдущая"
              @click.stop="prev"
            >
              <UIcon name="i-lucide-chevron-left" class="w-6 h-6" />
            </button>

            <div class="flex flex-col items-center justify-center gap-3 w-full h-full max-w-full max-h-full min-w-0 min-h-0" @click.stop>
              <!-- flex-1 и min-h-0 заставляют картинку занимать всё доступное место и масштабироваться -->
              <img
                :src="current.url"
                :alt="current.title ?? ''"
                class="block flex-1 min-h-0 w-full object-contain select-none cursor-zoom-out"
                @click="closeLightbox"
              />
              <div v-if="current.title" class="shrink-0 max-w-[720px] px-4 text-white text-[13px] leading-snug text-center opacity-85 break-words">
                {{ current.title }}
              </div>
            </div>

            <button
              v-if="hasNext"
              type="button"
              class="absolute top-1/2 -translate-y-1/2 right-0 inline-flex items-center justify-center w-12 h-12 p-0 border-none rounded-full bg-white/10 text-white cursor-pointer transition-all duration-150 hover:bg-white/20"
              aria-label="Следующая"
              @click.stop="next"
            >
              <UIcon name="i-lucide-chevron-right" class="w-6 h-6" />
            </button>

          </div>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>
