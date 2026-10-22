<script setup lang="ts">
import { ref } from 'vue'
import type { BlockStructItem, BlockStructBlock } from '~/types/lesson'

const props = withDefaults(defineProps<{
  structItems: BlockStructItem[]
  pending?: boolean
  error?: any
  depth?: number
}>(), {
  depth: 0,
})

// ==================== Аккордеон (состояние открытости) ====================

const STORAGE_KEY = 'lesson_blocks_open_nodes'

// Общий стейт для всех уровней вложенности
const openNodes = useState<number[]>('lesson-blocks-open-nodes', () => {
  if (import.meta.client) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }
  return []
})

function toggleType(id: number) {
  if (openNodes.value.includes(id)) {
    openNodes.value = openNodes.value.filter(x => x !== id)
  } else {
    openNodes.value = [...openNodes.value, id]
  }

  if (import.meta.client) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(openNodes.value))
  }
}

// ==================== Хелперы ====================

function iconOfBlock(block: BlockStructBlock): string {
  // 1. Приоритет — метаданные из реестра (приходят с бэка)
  if (block.block_type_icon && typeof block.block_type_icon === 'string') {
    return block.block_type_icon
  }

  // 2. Fallback — ищем 'icon' в настройках блока
  const settings = block.settings as any
  if (settings && typeof settings === 'object') {
    const children = Array.isArray(settings.children)
      ? settings.children
      : (Array.isArray(settings) ? settings : [])
    const icon = children.find((n: any) => n?.key === 'icon')?.default
    if (typeof icon === 'string' && icon) return icon
  }

  return 'i-lucide-file-text'
}

// ==================== Тултип ====================

const tooltip = ref({ visible: false, text: '', x: 0, y: 0 })
const TOOLTIP_OFFSET = 8

function showTooltip(e: MouseEvent, text: string | null | undefined) {
  if (!text) return
  const target = e.currentTarget as HTMLElement
  if (!target) return
  const rect = target.getBoundingClientRect()
  tooltip.value = {
    visible: true,
    text,
    x: rect.left + rect.width / 2,
    y: rect.top - TOOLTIP_OFFSET,
  }
}

function hideTooltip() {
  tooltip.value.visible = false
}

// ==================== Автоскролл названий ====================

const scrollingNameId = ref<number | null>(null)
const nameShift = ref(0)

function onNameEnter(typeId: number, e: MouseEvent) {
  const target = e.currentTarget as HTMLElement | null
  if (!target) return
  const inner = target.querySelector('.struct-name__inner') as HTMLElement | null
  if (!inner) return

  if (inner.scrollWidth <= target.clientWidth) {
    scrollingNameId.value = null
    return
  }

  nameShift.value = inner.scrollWidth - target.clientWidth + 8
  scrollingNameId.value = typeId
}

function onNameLeave() {
  scrollingNameId.value = null
}

// ==================== Drag ====================

function onBlockDragStart(e: DragEvent, type: BlockStructItem, block: BlockStructBlock) {
  if (!e.dataTransfer) return
  if (block.id <= 0) {
    e.preventDefault()
    return
  }

  const source = { type, block }
  ;(window as any).__draggedBlockSource = source

  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('text/plain', String(block.id))
}

function onBlockDragEnd() {
  ;(window as any).__draggedBlockSource = null
}
</script>

<template>
  <div>
    <LoadingOverlay :loading="props.pending && props.depth === 0">
      <div v-if="props.pending && props.depth === 0" class="px-4 py-8 text-center text-[13px] text-(--ui-text-muted)">
        Загрузка…
      </div>
      <div v-else-if="props.error && props.depth === 0" class="px-4 py-8 text-center text-[13px] text-(--ui-text-muted)">
        Не удалось загрузить структуру
      </div>
      <div v-else-if="props.structItems.length === 0 && props.depth === 0" class="px-4 py-8 text-center text-[13px] text-(--ui-text-muted)">
        Пока ничего нет
      </div>

      <div
        v-else
        class="flex flex-col gap-1.5"
        :class="depth > 0 ? 'mt-1 ml-1 pl-3 border-l border-default' : 'p-2.5'"
      >
        <div
          v-for="type in props.structItems"
          :key="type.id"
          class="rounded-lg border bg-(--ui-bg) transition-[border-color,box-shadow] hover:border-(--ui-primary)"
          :class="openNodes.includes(type.id)
            ? 'border-(--ui-primary) shadow-[0_1px_3px_rgba(59,130,246,0.08)]'
            : 'border-(--ui-border)'"
        >
          <button
            type="button"
            class="relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-(--ui-text) transition-colors hover:bg-(--ui-bg-muted)"
            :class="openNodes.includes(type.id)
              ? 'rounded-b-none border-b border-(--ui-border)'
              : ''"
            @click="toggleType(type.id)"
            @mouseenter="showTooltip($event, type.description)"
            @mouseleave="hideTooltip"
          >
            <!-- Иконка раскрытия (только если есть блоки или дети) -->
            <span
              class="inline-flex h-4 w-4 shrink-0 items-center justify-center text-(--ui-text-muted) transition-[transform,color] duration-200"
              :class="openNodes.includes(type.id) ? 'rotate-90 text-(--ui-primary)' : ''"
            >
              <UIcon
                v-if="type.blocks?.length || type.children?.length"
                name="i-lucide-chevron-right"
                class="h-4 w-4"
              />
              <span v-else class="h-4 w-4" />
            </span>

            <!-- Иконка папки/узла -->
            <UIcon
              name="i-lucide-folder-tree"
              class="h-4 w-4 shrink-0 text-(--ui-text-muted)"
              :class="openNodes.includes(type.id) ? '!text-(--ui-primary)' : ''"
            />

            <!-- Название -->
            <span
              class="relative min-w-0 flex-1 overflow-hidden font-medium whitespace-nowrap"
              @mouseenter="onNameEnter(type.id, $event)"
              @mouseleave="onNameLeave"
            >
              <span
                class="struct-name__inner inline-block whitespace-nowrap transition-transform duration-300 ease-out will-change-transform"
                :style="{
                  transform: scrollingNameId === type.id
                    ? `translateX(-${nameShift}px)`
                    : 'translateX(0)',
                }"
              >
                {{ type.name }}
              </span>
            </span>

            <!-- Бейдж с количеством -->
            <span
              class="inline-flex h-[18px] min-w-[22px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
              :class="type.blocks_count === 0
                ? 'text-(--ui-text-muted)'
                : 'text-(--ui-primary)'"
              :style="{
                background: type.blocks_count === 0
                  ? 'var(--ui-bg-muted)'
                  : 'color-mix(in srgb, var(--ui-primary) 10%, transparent)',
              }"
            >
              {{ type.blocks_count }}
            </span>
          </button>

          <Transition name="struct-expand">
            <div
              v-if="openNodes.includes(type.id)"
              class="flex flex-col gap-0.5 rounded-b-lg bg-(--ui-bg-elevated) p-1.5"
            >
              <div
                v-if="!type.blocks?.length && !type.children?.length"
                class="px-2 py-2.5 text-center text-xs text-(--ui-text-muted)"
              >
                Пусто
              </div>

              <!-- Блоки внутри текущего узла -->
              <template v-if="type.blocks?.length">
                <div
                  v-for="block in type.blocks"
                  :key="block.id"
                  class="group flex w-full cursor-grab items-center gap-2 rounded-[5px] bg-transparent px-2 py-1.5 text-left text-xs text-(--ui-text) transition-[background,color,box-shadow] select-none hover:bg-(--ui-bg) hover:text-(--ui-primary) hover:shadow-[0_1px_2px_rgba(15,23,42,0.05)] active:cursor-grabbing"
                  draggable="true"
                  @dragstart="onBlockDragStart($event, type, block)"
                  @dragend="onBlockDragEnd"
                  @mouseenter="showTooltip($event, block.description)"
                  @mouseleave="hideTooltip"
                >
                  <UIcon
                    :name="iconOfBlock(block)"
                    class="h-3.5 w-3.5 shrink-0 text-(--ui-text-muted) group-hover:text-(--ui-primary)"
                  />
                  <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                    {{ block.title || `Блок №${block.id}` }}
                  </span>
                  <span class="shrink-0 font-mono text-[10px] text-(--ui-text-muted)">
                    #{{ block.id }}
                  </span>
                </div>
              </template>

              <!-- Рекурсивный рендеринг дочерних узлов -->
              <LessonBlocksIndex
                v-if="type.children?.length"
                :struct-items="type.children"
                :depth="props.depth + 1"
              />
            </div>
          </Transition>
        </div>
      </div>
    </LoadingOverlay>
  </div>

  <!-- Тултип -->
  <Teleport to="body">
    <Transition name="struct-tooltip-fade">
      <div
        v-if="tooltip.visible"
        class="pointer-events-none fixed z-[9999] max-w-[260px] min-w-[80px] -translate-x-1/2 -translate-y-full rounded-md bg-gray-900/95 px-2.5 py-1.5 text-center text-[11px] leading-snug font-normal text-white shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
        :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
      >
        {{ tooltip.text }}
        <span class="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-900/95" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.struct-expand-enter-active, .struct-expand-leave-active {
  overflow: hidden;
  transition: max-height 0.25s ease, opacity 0.2s ease;
}
.struct-expand-enter-from, .struct-expand-leave-to { max-height: 0; opacity: 0; }
.struct-expand-enter-to, .struct-expand-leave-from { max-height: 2000px; opacity: 1; }

.struct-tooltip-fade-enter-active, .struct-tooltip-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.struct-tooltip-fade-enter-from, .struct-tooltip-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-100% + 4px));
}
</style>
