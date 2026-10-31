<script setup lang="ts">
import { computed, ref, onBeforeUnmount, onMounted, toRaw, provide } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import LessonBlockWrapper from '~/components/Constructor/LessonBlockWrapper.vue'
import BlockRenderer from '~/components/Constructor/BlockRenderer.vue'
import ReadOnlyWrapper from '~/components/Constructor/ReadOnlyWrapper.vue'
import { useContentStats } from '~/composables/useContentStats'
import type {
  LessonModel,
  LessonBlockModel,
  BlockStructItem,
  BlockStructBlock,
  DraggedBlockSource,
} from '~/types/lesson'

const api = useApi()
const toast = useToast()

// ==================== Props ====================

interface Props {
  structItems: BlockStructItem[]
  activeBlockLocalId?: string | null
  isReadOnly?: boolean
  mode?: 'edit' | 'learn'
  displayReadOnlyToast?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  activeBlockLocalId: null,
  isReadOnly: false,
  mode: 'edit',
  displayReadOnlyToast: true,
})

// ==================== Модель ====================

const lesson = defineModel<LessonModel>({ required: true })

// ==================== Эмиты ====================

const emit = defineEmits<{
  (e: 'update:activeBlockLocalId', value: string | null): void
  (e: 'register-files', blockLocalId: string, inst: any): void
  (e: 'test-warning', payload: { index: number, source: DraggedBlockSource }): void
  (e: 'open-task-collection', index: number): void
}>()

// ==================== Провайд режима ====================

const lessonMode = computed(() => props.mode)
provide('lesson-mode', lessonMode)

// ==================== Утилита поиска блока в дереве ====================

function findBlockInTree(nodes: BlockStructItem[], blockId: number | null): BlockStructBlock | null {
  if (!blockId) return null
  for (const node of nodes) {
    const found = node.blocks?.find(b => b.id === blockId)
    if (found) return found
    if (node.children?.length) {
      const inChildren = findBlockInTree(node.children, blockId)
      if (inChildren) return inChildren
    }
  }
  return null
}

// ==================== Активный блок ====================

function setActive(localId: string | null) {
  emit('update:activeBlockLocalId', localId)
}

function activateBlock(localId: string) {
  if (props.mode === 'learn' || props.isReadOnly) return
  setActive(localId)
}

function deactivate() {
  setActive(null)
}

// ==================== Работа с блоками ====================

function removeBlock(localId: string) {
  if (props.mode === 'learn' || props.isReadOnly) return
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
  if (props.mode === 'learn' || props.isReadOnly) return
  const idx = lesson.value.blocks.findIndex((b) => b.localId === localId)
  if (idx < 0) return

  const original = lesson.value.blocks[idx]
  if (!original.blockId) return
  if (!lesson.value.id) return

  // Запрещаем дублировать задания
  if (original.isTest) return

  try {
    const res = await api.post<{ data: any } | any>(
      `/lessons/${lesson.value.id}/blocks`,
      {
        block_id: original.blockId,
        order: idx + 1,
      },
    )
    const data = (res as any).data ?? res

    const sourceBlock = findBlockInTree(props.structItems, data.block_id)
    const rawSettings = data.settings ?? sourceBlock?.settings ?? sourceBlock?.default_settings ?? null
    const fullSettings = rawSettings ? structuredClone(toRaw(rawSettings)) : null

    const copy: LessonBlockModel = {
      localId: crypto.randomUUID(),
      id: data.id,
      blockId: data.block_id,
      blockTypeCode: data.block_type_code,
      settings: fullSettings,
      images: data.images ?? [],
      files: data.files ?? [],
      isTest: data.is_test ?? false,
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
  if (props.mode === 'learn' || props.isReadOnly) return
  const idx = lesson.value.blocks.findIndex((b) => b.localId === localId)
  if (idx <= 0) return

  const next = lesson.value.blocks.slice()
  const [moved] = next.splice(idx, 1)
  next.splice(idx - 1, 0, moved)
  lesson.value = { ...lesson.value, blocks: next }
}

function moveBlockDown(localId: string) {
  if (props.mode === 'learn' || props.isReadOnly) return
  const idx = lesson.value.blocks.findIndex((b) => b.localId === localId)
  if (idx < 0 || idx >= lesson.value.blocks.length - 1) return

  const next = lesson.value.blocks.slice()
  const [moved] = next.splice(idx, 1)
  next.splice(idx + 1, 0, moved)
  lesson.value = { ...lesson.value, blocks: next }
}

// ==================== Drag-and-drop ====================

const dragOverIndex = ref<number | null>(null)

async function handleDropAtIndex(index: number, source: DraggedBlockSource | null, force: boolean = false) {
  if (props.mode === 'learn' || props.isReadOnly) return
  if (!source) return
  if (!lesson.value.id) return

  // Проверка на вызов коллекции заданий
  if (source.isCollectionTask) {
    emit('open-task-collection', index)
    return
  }

  // Проверка на задание (если это не принудительное добавление)
  if (source.block?.is_test && !force) {
    const accepted = import.meta.client ? localStorage.getItem('lesson_test_warning_accepted') === 'true' : false
    if (!accepted) {
      emit('test-warning', { index, source })
      return
    }
  }

  try {
    if (!source.block) return

    const res = await api.post<{ data: any } | any>(
      `/lessons/${lesson.value.id}/blocks`,
      {
        block_id: source.block.id,
        order: index,
      },
    )
    const data = (res as any).data ?? res

    const sourceBlock = findBlockInTree(props.structItems, data.block_id)
    const rawSettings = data.settings ?? sourceBlock?.settings ?? sourceBlock?.default_settings ?? null
    const fullSettings = rawSettings ? structuredClone(toRaw(rawSettings)) : null

    const newBlock: LessonBlockModel = {
      localId: crypto.randomUUID(),
      id: data.id,
      blockId: data.block_id,
      blockTypeCode: data.block_type_code,
      settings: fullSettings,
      images: data.images ?? [],
      files: data.files ?? [],
      isTest: data.is_test ?? source.block.is_test ?? false,
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

function handleDrop(e: DragEvent) {
  if (!getDraggedSource()) return
  e.preventDefault()
  if (dragOverIndex.value === null) return

  const source = getDraggedSource()
  if (source) {
    handleDropAtIndex(dragOverIndex.value, source)
  }
  dragOverIndex.value = null
}

function onDragOver(index: number, e: DragEvent) {
  if (!getDraggedSource()) return
  e.preventDefault()
  dragOverIndex.value = index
}

function onBlockDragOver(index: number, e: DragEvent) {
  if (!getDraggedSource()) return
  e.preventDefault()
  const target = e.currentTarget as HTMLElement
  if (!target) return

  const rect = target.getBoundingClientRect()
  const midpoint = rect.top + rect.height / 2

  if (e.clientY < midpoint) {
    dragOverIndex.value = index
  } else {
    dragOverIndex.value = index + 1
  }
}

function onDropEmpty(e: DragEvent) {
  if (!getDraggedSource()) return
  e.preventDefault()
  const source = getDraggedSource()
  handleDropAtIndex(0, source)
  dragOverIndex.value = null
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
  if (props.mode === 'learn' || props.isReadOnly) return
  lesson.value = { ...lesson.value, title: v }
}

function updateDescription(v: string) {
  if (props.mode === 'learn' || props.isReadOnly) return
  lesson.value = { ...lesson.value, description: v }
}

// ==================== Статистика ====================

const contentRef = ref<HTMLElement | null>(null)

const { totalChars, readingTimeText } = useContentStats({
  container: contentRef,
  headText: () => `${lesson.value.title ?? ''} ${lesson.value.description ?? ''}`,
  charsPerMinute: 1000,
  formulaWeight: 2,
  contentSelector: '[data-lesson-content-body]',
  watchSource: () => lesson.value,
})

// ==================== Защита от редактирования ====================

let isToastVisible = false
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showReadOnlyToast() {
  if (isToastVisible) return
  if (!props.displayReadOnlyToast) return

  isToastVisible = true

  toast.add({
    title: 'Урок опубликован',
    description: 'Снимите урок с публикации, чтобы редактировать его.',
    color: 'warning',
    icon: 'i-lucide-lock',
    timeout: 3000,
  })

  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    isToastVisible = false
    toastTimer = null
  }, 3000)
}

function handleOverlayClick() {
  if (props.isReadOnly) {
    showReadOnlyToast()
  }
}

function handleFocusIn(e: FocusEvent) {
  if (!props.isReadOnly) return
  const target = e.target as HTMLElement
  if (target && typeof target.blur === 'function') {
    target.blur()
  }
  showReadOnlyToast()
}

// ==================== Глобальная деактивация ====================

function onGlobalPointerDown(e: PointerEvent) {
  if (props.mode === 'learn') return
  const target = e.target as HTMLElement | null
  if (!target) return

  if (target.closest('.block-wrapper')) return
  if (target.closest('.block-settings-panel')) return
  if (target.closest('[data-drop-zone]')) return
  if (target.closest('[data-block-action]')) return
  if (target.closest('.crop-modal-backdrop')) return
  if (target.closest('.cursor-col-resize')) return
  if (target.closest('[role="dialog"]')) return
  if (target.closest('[role="listbox"]')) return
  if (target.closest('[role="menu"]')) return
  if (target.closest('[data-reka-popper-content-wrapper]')) return
  if (target.closest('[data-radix-popper-content-wrapper]')) return

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
  if (toastTimer) clearTimeout(toastTimer)
})

function clearDragOver() {
  dragOverIndex.value = null
}

// ==================== Экспорт ====================

defineExpose({
  removeBlock,
  duplicateBlock,
  handleDropAtIndex, // Экспортируем для вызова из родителя
  contentRef, // Экспорт DOM-контейнера для родителя
})
</script>

<template>
  <div
    ref="contentRef"
    class="relative flex flex-col gap-4 min-h-full"
    @focusin="handleFocusIn"
  >
    <div class="flex flex-col gap-2">
      <input
        class="w-full p-0 border-none bg-transparent text-[28px] font-bold leading-tight text-[var(--ui-text,#0f172a)] outline-none placeholder:text-[var(--ui-text-muted,#cbd5e1)]"
        :value="lesson.title"
        placeholder="Заголовок урока"
        :readonly="isReadOnly || mode === 'learn'"
        @input="updateTitle(($event.target as HTMLInputElement).value)"
      />
      <textarea
        class="w-full p-0 border-none bg-transparent font-[inherit] text-sm leading-normal text-[var(--ui-text-muted,#64748b)] resize-none outline-none overflow-hidden placeholder:text-[var(--ui-text-muted,#cbd5e1)]"
        :value="lesson.description"
        placeholder="Краткое описание урока"
        rows="1"
        :readonly="isReadOnly || mode === 'learn'"
        @input="updateDescription(($event.target as HTMLTextAreaElement).value)"
      />
    </div>

    <div
      class="flex items-center justify-between py-2 border-y border-[var(--ui-border,#f1f5f9)] text-xs text-[var(--ui-text-muted,#94a3b8)]"
    >
      <div class="flex items-center gap-3.5">
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

      <div class="flex items-center gap-4">
        <ConstructorTaxonomySelector v-model="lesson.taxonomy_ids" v-if="lesson.id" />
      </div>
    </div>

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

    <VueDraggable
      v-else
      v-model="lesson.blocks"
      :animation="200"
      handle=".drag-handle"
      ghost-class="block-ghost"
      chosen-class="block-chosen"
      drag-class="block-drag"
      class="flex flex-col min-h-[100px]"
      :filter="'[data-drop-zone]'"
      :disabled="isReadOnly || mode === 'learn'"
      @dragleave="onDragLeave"
    >
      <template #default>
        <div
          data-drop-zone
          class="relative rounded transition-all duration-150 pointer-events-auto"
          :class="dragOverIndex === 0
            ? 'h-8 my-1 bg-[var(--ui-primary-muted,rgba(59,130,246,0.15))] border-2 border-dashed border-[var(--ui-primary,#3b82f6)]'
            : 'h-0 overflow-hidden'"
          @dragover="onDragOver(0, $event)"
          @dragleave="onDragLeave"
          @drop="handleDrop"
        />

        <template v-for="(block, index) in lesson.blocks" :key="block.localId">
          <div
            class="relative"
            @dragover="onBlockDragOver(index, $event)"
            @drop="handleDrop"
          >
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
                <!-- Обертка для заданий -->
                <ReadOnlyWrapper v-if="block.isTest">
                  <BlockRenderer
                    :code="block.blockTypeCode"
                    :id="block.id"
                    :is-test="block.isTest"
                    mode="body"
                    model-name="lesson_blocks"
                    :initial-images="block.images ?? []"
                    :show-to-delete-images="true"
                    v-model:settings="block.settings"
                    @register-files="onRegisterFiles(block, $event)"
                  />
                </ReadOnlyWrapper>

                <!-- Обычные блоки -->
                <BlockRenderer
                  v-else
                  :code="block.blockTypeCode"
                  :id="block.id"
                  :is-test="block.isTest"
                  mode="body"
                  model-name="lesson_blocks"
                  :initial-images="block.images ?? []"
                  :show-to-delete-images="true"
                  v-model:settings="block.settings"
                  @register-files="onRegisterFiles(block, $event)"
                />
              </div>
            </LessonBlockWrapper>

            <!-- Клик-зона для выбора блока (скрываем в learn) -->
            <div
              v-if="mode === 'edit' && !isReadOnly"
              class="absolute top-0 left-full ml-[5px] h-[calc(100%-50px)] w-[75px] rounded-r-md cursor-pointer transition-colors z-0 bg-gradient-to-r from-transparent"
              :class="props.activeBlockLocalId === block.localId
                ? 'to-blue-200/40 dark:to-blue-800/40'
                : 'to-gray-200/60 dark:to-gray-700/60 hover:to-blue-200/60 dark:hover:to-blue-800/60'"
              title="Выбрать блок"
              @click.stop="activateBlock(block.localId)"
            />
          </div>

          <div
            data-drop-zone
            class="relative rounded transition-all duration-150 pointer-events-auto"
            :class="dragOverIndex === index + 1
              ? 'h-8 my-1 bg-[var(--ui-primary-muted,rgba(59,130,246,0.15))] border-2 border-dashed border-[var(--ui-primary,#3b82f6)]'
              : 'h-0 overflow-hidden'"
            @dragover="onDragOver(index + 1, $event)"
            @dragleave="onDragLeave"
            @drop="handleDrop"
          />
        </template>
      </template>
    </VueDraggable>

    <!-- Оверлей для isReadOnly (публикация) -->
    <div
      v-if="isReadOnly"
      class="absolute inset-0 z-50 bg-transparent cursor-not-allowed"
      @click="handleOverlayClick"
    />
  </div>
</template>

<style>
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
