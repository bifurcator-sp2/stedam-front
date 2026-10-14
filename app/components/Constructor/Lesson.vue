<script setup lang="ts">
// app/components/Constructor/Lesson.vue

import { computed, ref, onBeforeUnmount, onMounted } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import LessonBlockWrapper from '~/components/Constructor/LessonBlockWrapper.vue'
import BlockRenderer from '~/components/Constructor/BlockRenderer.vue'
import { mergeFlat } from '~/utils/constructors'
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

/**
 * Извлекает массив изображений из настроек блока.
 * Используется для рендера изображений в text_image без API (id = 0).
 *
 * Ищем в settings узел с key = 'images' и берём массив из его default.
 * Если структура другая — доработаем по мере появления блоков.
 */
function extractImagesFromSettings(settings: any[] | undefined): any[] {
  if (!Array.isArray(settings)) return []

  const imagesNode = settings.find((s) => s?.key === 'images')
  if (!imagesNode) return []

  // Вариант 1: массив прямо в default
  if (Array.isArray(imagesNode.default)) {
    return imagesNode.default
  }

  // Вариант 2: массив в дочернем узле
  if (Array.isArray(imagesNode.children)) {
    const candidates = ['default', 'files', 'items', 'list']
    for (const key of candidates) {
      const child = imagesNode.children.find((c: any) => c?.key === key)
      if (Array.isArray(child?.default)) return child.default
    }
  }

  return []
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

// ==================== Статистика ====================

function extractText(input: unknown): { plain: string; formulaChars: number } {
  if (input == null) return { plain: '', formulaChars: 0 }
  let text: string

  if (typeof input === 'object') {
    const parts = Object.values(input as Record<string, unknown>)
      .map((v) => {
        const r = extractText(v)
        return r.plain
      })
      .join(' ')
    text = parts
  } else if (typeof input === 'string') {
    text = input
  } else {
    return { plain: '', formulaChars: 0 }
  }

  let formulaChars = 0
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
    formulaChars += latex.replace(/\s+/g, '').length
    return ' '
  })
  text = text.replace(/\$([^\$\n]+?)\$/g, (_, latex) => {
    formulaChars += latex.replace(/\s+/g, '').length
    return ' '
  })

  const plain = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return { plain, formulaChars }
}

function collectTextFromSettings(settings: any[] | undefined): string {
  if (!Array.isArray(settings)) return ''
  const parts: string[] = []

  for (const node of settings) {
    if (node?.children?.length) {
      parts.push(collectTextFromSettings(node.children))
      continue
    }
    if (node?.type === 'string' && typeof node.default === 'string') {
      parts.push(node.default)
    }
  }

  return parts.join(' ')
}

const stats = computed(() => {
  let plainText = lesson.value.title + ' ' + lesson.value.description
  let formulaChars = 0

  for (const block of lesson.value.blocks) {
    const textFromBlock = collectTextFromSettings(block.settings)
    const { plain, formulaChars: fc } = extractText(textFromBlock)
    plainText += ' ' + plain
    formulaChars += fc
  }

  const { plain, formulaChars: fc2 } = extractText(plainText)
  const totalPlain = plain
  const totalFormula = formulaChars + fc2

  const plainChars = totalPlain.replace(/\s+/g, '').length
  const words = totalPlain.split(/\s+/).filter(Boolean).length

  return { plainChars, formulaChars: totalFormula, words }
})

const totalChars = computed(
  () => stats.value.plainChars + stats.value.formulaChars,
)

const CHARS_PER_MINUTE = 1000
const FORMULA_WEIGHT = 2

const readingTimeText = computed(() => {
  const effectiveChars =
    stats.value.plainChars + stats.value.formulaChars * FORMULA_WEIGHT
  if (effectiveChars === 0) return '0 сек'

  const minutes = effectiveChars / CHARS_PER_MINUTE
  if (minutes < 1) return `${Math.round(minutes * 60)} сек`

  const wholeMinutes = Math.floor(minutes)
  const seconds = Math.round((minutes - wholeMinutes) * 60)
  if (seconds === 0) return `${wholeMinutes} мин`
  return `${wholeMinutes} мин ${seconds} сек`
})

// ==================== Клик по пустому месту ====================

function onRootClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('.block-wrapper')) return
  if (target.closest('[data-drop-zone]')) return

  deactivate()
}

// ==================== Lifecycle ====================

onMounted(() => {
  window.addEventListener('dragend', clearDragOver)
})

onBeforeUnmount(() => {
  window.removeEventListener('dragend', clearDragOver)
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
  <div class="flex flex-col gap-4 min-h-full" @click="onRootClick">
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
    >
      <template #default>
        <!-- Drop-zone ПЕРЕД первым -->
        <div
          data-drop-zone
          class="relative h-2 -my-0.5 rounded transition-all pointer-events-auto"
          :class="dragOverIndex === 0
            ? 'h-5 bg-[var(--ui-primary-muted,rgba(59,130,246,0.15))] border-2 border-dashed border-[var(--ui-primary,#3b82f6)]'
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
            <BlockRenderer
              :code="block.blockTypeCode"
              :id="block.id"
              mode="body"
              model-name="lesson_blocks"
              :initial-images="block.images ?? []"
              v-model:settings="block.settings"
              @register-files="onRegisterFiles(block, $event)"
            />
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
