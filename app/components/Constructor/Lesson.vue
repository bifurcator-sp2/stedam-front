<script setup lang="ts">
// app/components/Constructor/Lesson.vue

import { computed, ref, onBeforeUnmount, onMounted } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import LessonBlockWrapper from '~/components/Constructor/LessonBlockWrapper.vue'
import BlockRenderer from '~/components/Constructor/BlockRenderer.vue'
import { mergeFlat } from '~/utils/constructors'
import { useContentStats } from '~/composables/useContentStats'
import type {
  LessonModel,
  LessonBlockModel,
  BlockStructItem,
  DraggedBlockSource,
} from '~/types/lesson'

const api = useApi()

// ==================== Props ====================

interface Props {
  structItems: BlockStructItem[]
  activeBlockLocalId?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  activeBlockLocalId: null,
})

// ==================== Модель ====================

const lesson = defineModel<LessonModel>({ required: true })

// ==================== Эмиты ====================

const emit = defineEmits<{
  (e: 'update:activeBlockLocalId', value: string | null): void
  (e: 'register-files', blockLocalId: string, inst: any): void
}>()

// ==================== Активный блок ====================

function setActive(localId: string | null) {
  emit('update:activeBlockLocalId', localId)
}

function activateBlock(localId: string) {
  setActive(localId)
}

function deactivate() {
  setActive(null)
}

// ==================== Работа с блоками ====================

function removeBlock(localId: string) {
  const idx = lesson.value.blocks.findIndex((b) => b.localId === localId)
  if (idx < 0) return

  const next = lesson.value.blocks.slice()
  next.splice(idx, 1)
  lesson.value = { ...lesson.value, blocks: next }

  if (props.activeBlockLocalId === localId) {
    deactivate()
  }
}

async function duplicateBlock(localId: string) {
  const idx = lesson.value.blocks.findIndex((b) => b.localId === localId)
  if (idx < 0) return

  const original = lesson.value.blocks[idx]
  if (!original.blockId) return
  if (!lesson.value.id) return

  try {
    const res = await api.post<{ data: any } | any>(
      `/lessons/${lesson.value.id}/blocks`,
      {
        block_id: original.blockId,
        order: idx + 1,
      },
    )
    const data = (res as any).data ?? res

    const type = props.structItems.find((t) => t.code === data.block_type_code)
    const sourceBlock = type?.blocks.find((sb) => sb.id === data.block_id)

    const fullSettings = mergeFlat(
      type?.default_settings ?? [],
      sourceBlock?.settings ?? undefined,
      data.settings ?? undefined,
    )

    const copy: LessonBlockModel = {
      localId: crypto.randomUUID(),
      id: data.id,
      blockId: data.block_id,
      blockTypeCode: data.block_type_code,
      settings: fullSettings,
      images: data.images ?? [],
      files: data.files ?? [],
    }

    const next = lesson.value.blocks.slice()
    next.splice(idx + 1, 0, copy)
    lesson.value = { ...lesson.value, blocks: next }

    setActive(copy.localId)
  } catch (e) {
    console.error('[duplicateBlock] failed', e)
  }
}

function moveBlockUp(localId: string) {
  const idx = lesson.value.blocks.findIndex((b) => b.localId === localId)
  if (idx <= 0) return

  const next = lesson.value.blocks.slice()
  const [moved] = next.splice(idx, 1)
  next.splice(idx - 1, 0, moved)
  lesson.value = { ...lesson.value, blocks: next }
}

function moveBlockDown(localId: string) {
  const idx = lesson.value.blocks.findIndex((b) => b.localId === localId)
  if (idx < 0 || idx >= lesson.value.blocks.length - 1) return

  const next = lesson.value.blocks.slice()
  const [moved] = next.splice(idx, 1)
  next.splice(idx + 1, 0, moved)
  lesson.value = { ...lesson.value, blocks: next }
}

// ==================== Drag-and-drop ====================

const dragOverIndex = ref<number | null>(null)

async function handleDropAtIndex(index: number, source: DraggedBlockSource | null) {
  if (!source) return
  if (!lesson.value.id) return

  try {
    const res = await api.post<{ data: any } | any>(
      `/lessons/${lesson.value.id}/blocks`,
      {
        block_id: source.block.id,
        order: index,
      },
    )
    const data = (res as any).data ?? res

    const type = props.structItems.find((t) => t.code === data.block_type_code)
    const sourceBlock = type?.blocks.find((sb) => sb.id === data.block_id)

    const fullSettings = mergeFlat(
      type?.default_settings ?? [],
      sourceBlock?.settings ?? undefined,
      data.settings ?? undefined,
    )

    const newBlock: LessonBlockModel = {
      localId: crypto.randomUUID(),
      id: data.id,
      blockId: data.block_id,
      blockTypeCode: data.block_type_code,
      settings: fullSettings,
      images: data.images ?? [],
      files: data.files ?? [],
    }

    const next = lesson.value.blocks.slice()
    const safeIndex = Math.max(0, Math.min(index, next.length))
    next.splice(safeIndex, 0, newBlock)
    lesson.value = { ...lesson.value, blocks: next }

    setActive(newBlock.localId)
  } catch (e) {
    console.error('[handleDropAtIndex] failed', e)
  }
}

function onDropZone(index: number, e: DragEvent) {
  e.preventDefault()
  const source = getDraggedSource()
  handleDropAtIndex(index, source)
  dragOverIndex.value = null
}

function onDropEnd(e: DragEvent) {
  e.preventDefault()
  const source = getDraggedSource()
  handleDropAtIndex(lesson.value.blocks.length, source)
  dragOverIndex.value = null
}

function onDropEmpty(e: DragEvent) {
  e.preventDefault()
  const source = getDraggedSource()
  handleDropAtIndex(0, source)
  dragOverIndex.value = null
}

function onDragOver(index: number, e: DragEvent) {
  e.preventDefault()
  dragOverIndex.value = index
}

function onDragLeave() {
  dragOverIndex.value = null
}

// ==================== Получение источника drag ====================

function getDraggedSource(): DraggedBlockSource | null {
  if (import.meta.client) {
    return (window as any).__draggedBlockSource ?? null
  }
  return null
}

// ==================== Регистрация FileContainer ====================

function onRegisterFiles(block: LessonBlockModel, inst: any) {
  emit('register-files', block.localId, inst)
}

// ==================== Inline-edit ====================

function updateTitle(v: string) {
  lesson.value = { ...lesson.value, title: v }
}

function updateDescription(v: string) {
  lesson.value = { ...lesson.value, description: v }
}

// ==================== Статистика (через composable) ====================

const contentRef = ref<HTMLElement | null>(null)

const { totalChars, readingTimeText } = useContentStats({
  container: contentRef,
  headText: () => `${lesson.value.title ?? ''} ${lesson.value.description ?? ''}`,
  charsPerMinute: 1000,
  formulaWeight: 2,
  contentSelector: '[data-lesson-content-body]',
  watchSource: () => lesson.value,
})

// ==================== Глобальная деактивация ====================

function onGlobalPointerDown(e: PointerEvent) {
  const target = e.target as HTMLElement | null
  if (!target) return

  if (target.closest('.block-wrapper')) return
  if (target.closest('.block-settings-panel')) return
  if (target.closest('[data-drop-zone]')) return
  if (target.closest('[data-block-action]')) return
  if (target.closest('.crop-modal-backdrop')) return

  deactivate()
}

// ==================== Lifecycle ====================

onMounted(() => {
  window.addEventListener('dragend', clearDragOver)
  document.addEventListener('pointerdown', onGlobalPointerDown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('dragend', clearDragOver)
  document.removeEventListener('pointerdown', onGlobalPointerDown, true)
})

function clearDragOver() {
  dragOverIndex.value = null
}

// ==================== Экспорт ====================

defineExpose({
  removeBlock,
  duplicateBlock,
})
</script>

<template>
  <div ref="contentRef" class="flex flex-col gap-4 min-h-full">
    <!-- === Шапка урока === -->
    <div class="flex flex-col gap-2">
      <input
        class="w-full p-0 border-none bg-transparent text-[28px] font-bold leading-tight text-[var(--ui-text,#0f172a)] outline-none placeholder:text-[var(--ui-text-muted,#cbd5e1)]"
        :value="lesson.title"
        placeholder="Заголовок урока"
        @input="updateTitle(($event.target as HTMLInputElement).value)"
      />
      <textarea
        class="w-full p-0 border-none bg-transparent font-[inherit] text-sm leading-normal text-[var(--ui-text-muted,#64748b)] resize-none outline-none overflow-hidden placeholder:text-[var(--ui-text-muted,#cbd5e1)]"
        :value="lesson.description"
        placeholder="Краткое описание урока"
        rows="1"
        @input="updateDescription(($event.target as HTMLTextAreaElement).value)"
      />
    </div>

    <!-- === Статистика === -->
    <div
      class="flex items-center gap-3.5 py-2 border-y border-[var(--ui-border,#f1f5f9)] text-xs text-[var(--ui-text-muted,#94a3b8)]"
    >
      <span class="inline-flex items-center gap-1.5 [&_svg]:w-[13px] [&_svg]:h-[13px]">
        <UIcon name="i-lucide-type" />
        {{ totalChars }}
      </span>
      <span class="inline-flex items-center gap-1.5 [&_svg]:w-[13px] [&_svg]:h-[13px]">
        <UIcon name="i-lucide-clock" />
        {{ readingTimeText }}
      </span>
      <span class="inline-flex items-center gap-1.5 [&_svg]:w-[13px] [&_svg]:h-[13px]">
        <UIcon name="i-lucide-layers" />
        {{ lesson.blocks.length }}
      </span>
    </div>

    <!-- === Пустой урок === -->
    <div
      v-if="lesson.blocks.length === 0"
      data-drop-zone
      class="flex flex-col items-center justify-center gap-2.5 min-h-[240px] p-10 border-2 border-dashed border-[var(--ui-border,#e5e7eb)] rounded-xl bg-[var(--ui-bg-elevated,#f8fafc)] text-[var(--ui-text-muted,#94a3b8)] text-center transition-colors hover:border-[var(--ui-primary,#3b82f6)] hover:bg-[var(--ui-bg,#ffffff)]"
      @dragover.prevent
      @drop="onDropEmpty"
    >
      <UIcon name="i-lucide-download" class="w-9 h-9 opacity-50" />
      <span class="text-sm font-medium text-[var(--ui-text,#334155)]">
        Перетащите блок из левой панели
      </span>
      <span class="text-xs">
        Блоки можно двигать и дублировать
      </span>
    </div>

    <!-- === Список блоков === -->
    <VueDraggable
      v-else
      v-model="lesson.blocks"
      :animation="200"
      handle=".drag-handle"
      ghost-class="block-ghost"
      chosen-class="block-chosen"
      drag-class="block-drag"
      class="flex flex-col gap-1 min-h-[100px]"
      :filter="'[data-drop-zone]'"
    >
      <template #default>
        <!-- Drop-zone ПЕРЕД первым (увеличенная и без отрицательного отступа) -->
        <div
          data-drop-zone
          class="relative h-6 -my-2 rounded transition-all pointer-events-auto"
          :class="dragOverIndex === 0
            ? 'h-8 bg-[var(--ui-primary-muted,rgba(59,130,246,0.15))] border-2 border-dashed border-[var(--ui-primary,#3b82f6)]'
            : ''"
          @dragover="onDragOver(0, $event)"
          @dragleave="onDragLeave"
          @drop="onDropZone(0, $event)"
        />

        <template v-for="(block, index) in lesson.blocks" :key="block.localId">
          <LessonBlockWrapper
            :active="props.activeBlockLocalId === block.localId"
            :draggable="true"
            :can-move-up="index > 0"
            :can-move-down="index < lesson.blocks.length - 1"
            @activate="activateBlock(block.localId)"
            @remove="removeBlock(block.localId)"
            @duplicate="duplicateBlock(block.localId)"
            @move-up="moveBlockUp(block.localId)"
            @move-down="moveBlockDown(block.localId)"
          >
            <div data-lesson-content-body>
              <BlockRenderer
                :code="block.blockTypeCode"
                :id="block.id"
                mode="body"
                model-name="lesson_blocks"
                :initial-images="block.images ?? []"
                :show-to-delete-images="true"
                v-model:settings="block.settings"
                @register-files="onRegisterFiles(block, $event)"
              />
            </div>
          </LessonBlockWrapper>

          <!-- Drop-zone ПОСЛЕ блока -->
          <div
            data-drop-zone
            class="relative h-2 -my-0.5 rounded transition-all pointer-events-auto"
            :class="dragOverIndex === index + 1
              ? 'h-5 bg-[var(--ui-primary-muted,rgba(59,130,246,0.15))] border-2 border-dashed border-[var(--ui-primary,#3b82f6)]'
              : ''"
            @dragover="onDragOver(index + 1, $event)"
            @dragleave="onDragLeave"
            @drop="onDropZone(index + 1, $event)"
          />
        </template>
      </template>
    </VueDraggable>
  </div>
</template>

<style>
/* Классы, добавляемые VueDraggable снаружи элемента —
   не могут быть scoped, иначе не применятся. */
.block-ghost {
  opacity: 0.4;
  background: var(--ui-bg-elevated, #f8fafc);
  border: 1px dashed var(--ui-primary, #3b82f6);
}

.block-chosen {
  cursor: grabbing;
}

.block-drag {
  cursor: grabbing;
}
</style>
