<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import TestListElement from '~/components/Education/TestListElement.vue'
import TestsSearch from '~/components/Education/TestsSearch.vue'
import type { BlockStructItem, BlockStructBlock } from '~/types/lesson'

const props = withDefaults(defineProps<{
  structItems: BlockStructItem[]
  pending?: boolean
  error?: any
  depth?: number
  taxonomyIds?: number[] | null
}>(), {
  depth: 0,
  taxonomyIds: () => [],
})

const emit = defineEmits<{
  (e: 'select-block', payload: { type: BlockStructItem; block: BlockStructBlock }): void
  (e: 'select-test', test: any): void
}>()

const api = useApi()

// ==================== Состояние панели ====================

const containerRef = ref<HTMLElement | null>(null)
const flyoutRef = ref<HTMLElement | null>(null)

const activeType = ref<BlockStructItem | null>(null)
const showTestsSearch = ref(false)
const showProcSearch = ref(false)
const panelStyle = ref<Record<string, string>>({})

// Функция для отслеживания позиции при скролле
function updatePanelPosition() {
  if (!activeType.value && !showTestsSearch.value && !showProcSearch.value) return
  if (!containerRef.value) return

  const containerRect = containerRef.value.getBoundingClientRect()
  panelStyle.value = {
    ...panelStyle.value,
    top: `${containerRect.top}px`
  }
}

// ==================== Данные для процедурных заданий ====================

const procTests = ref<any[]>([])
const procLoading = ref(false)
const animatedWidths = ref<Record<number, number>>({})

const primaryTaxonomyId = computed<number | null>(() => {
  const ids = props.taxonomyIds
  if (!ids || !ids.length) return null
  const first = ids[0]
  return Number.isFinite(first) && first > 0 ? first : null
})

async function fetchProcTests() {
  if (procTests.value.length > 0) return

  // Если таксономия не выбрана — очищаем список
  if (!primaryTaxonomyId.value) {
    procTests.value = []
    return
  }

  procLoading.value = true
  try {
    const res = await api.get<any[]>('/tests-proc', {
      params: { tax: primaryTaxonomyId.value },
      silent: true
    })
    procTests.value = res.data ?? res
  } catch (e) {
    console.error('Failed to load proc tests', e)
    procTests.value = []
  } finally {
    procLoading.value = false
  }
}

// Следим за изменением primaryTaxonomyId (сброс кэша и перезапрос)
watch(primaryTaxonomyId, () => {
  procTests.value = []
  if (showProcSearch.value) {
    fetchProcTests()
  }
})

// Логика анимации: сбрасываем в 0, затем через мгновение ставим целевое значение
watch([showProcSearch, procTests], () => {
  if (showProcSearch.value && procTests.value.length > 0) {
    const init: Record<number, number> = {}
    procTests.value.forEach(t => init[t.id] = 0)
    animatedWidths.value = init

    setTimeout(() => {
      const target: Record<number, number> = {}
      procTests.value.forEach(t => {
        target[t.id] = (getProcProgressValue(t.complexity) / 50) * 100
      })
      animatedWidths.value = target
    }, 50)
  } else if (!showProcSearch.value) {
    animatedWidths.value = {}
  }
}, { immediate: true, deep: true })

// ==================== Колонки ====================

const COLUMNS_KEY = 'lesson_blocks_columns'
const columns = ref<1 | 2>(1)

// ==================== Ширина панели ====================

const WIDTH_KEY = 'lesson_blocks_panel_width'
const panelWidth = ref(360)
const isResizing = ref(false)
let startX = 0
let startWidth = 0

function startResize(e: PointerEvent) {
  e.preventDefault()
  isResizing.value = true
  startX = e.clientX
  startWidth = panelWidth.value

  document.addEventListener('pointermove', onResize)
  document.addEventListener('pointerup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onResize(e: PointerEvent) {
  if (!isResizing.value) return
  const delta = e.clientX - startX
  let nextWidth = startWidth + delta

  if (nextWidth < 280) nextWidth = 280
  if (nextWidth > 800) nextWidth = 800

  panelWidth.value = nextWidth
}

function stopResize() {
  if (!isResizing.value) return
  isResizing.value = false
  document.removeEventListener('pointermove', onResize)
  document.removeEventListener('pointerup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''

  if (import.meta.client) {
    localStorage.setItem(WIDTH_KEY, String(panelWidth.value))
  }
}

// Восстановление настроек при монтировании
onMounted(() => {
  if (import.meta.client) {
    const storedCols = localStorage.getItem(COLUMNS_KEY)
    if (storedCols) columns.value = Number(storedCols) === 2 ? 2 : 1

    const storedWidth = localStorage.getItem(WIDTH_KEY)
    if (storedWidth) panelWidth.value = Number(storedWidth) || 360
  }

  document.addEventListener('pointerdown', handleOutsideClick)
  window.addEventListener('drop', handleDrop)

  // Добавляем слушатели для скролла и ресайза
  window.addEventListener('scroll', updatePanelPosition, true)
  window.addEventListener('resize', updatePanelPosition)
})

// Сохранение колонок при изменении
watch(columns, (val) => {
  if (import.meta.client) {
    localStorage.setItem(COLUMNS_KEY, String(val))
  }
})

// ==================== Открытие / Закрытие ====================

function closeFlyout() {
  activeType.value = null
  showTestsSearch.value = false
  showProcSearch.value = false
}

function toggleType(type: BlockStructItem, e: MouseEvent) {
  e.stopPropagation()

  if (activeType.value?.id === type.id && !showTestsSearch.value && !showProcSearch.value) {
    closeFlyout()
    return
  }

  const containerRect = containerRef.value?.getBoundingClientRect()
  const targetRect = (e.currentTarget as HTMLElement).getBoundingClientRect()

  panelStyle.value = {
    top: `${containerRect?.top ?? 0}px`,
    left: `${targetRect.right + 4}px`,
    bottom: '0px',
  }

  activeType.value = type
  showTestsSearch.value = false
  showProcSearch.value = false
}

function openCollection(e: MouseEvent) {
  e.stopPropagation()

  if (showTestsSearch.value) {
    closeFlyout()
    return
  }

  const containerRect = containerRef.value?.getBoundingClientRect()
  const targetRect = (e.currentTarget as HTMLElement).getBoundingClientRect()

  panelStyle.value = {
    top: `${containerRect?.top ?? 0}px`,
    left: `${targetRect.right + 4}px`,
    bottom: '0px',
  }

  activeType.value = null
  showTestsSearch.value = true
  showProcSearch.value = false
}

function openProcSearch(e: MouseEvent) {
  e.stopPropagation()

  if (showProcSearch.value) {
    closeFlyout()
    return
  }

  const containerRect = containerRef.value?.getBoundingClientRect()
  const targetRect = (e.currentTarget as HTMLElement).getBoundingClientRect()

  panelStyle.value = {
    top: `${containerRect?.top ?? 0}px`,
    left: `${targetRect.right + 4}px`,
    bottom: '0px',
  }

  activeType.value = null
  showTestsSearch.value = false
  showProcSearch.value = true

  fetchProcTests()
}

function handleOutsideClick(e: PointerEvent) {
  if (!activeType.value && !showTestsSearch.value && !showProcSearch.value) return
  const target = e.target as HTMLElement

  if (flyoutRef.value?.contains(target)) return
  if (containerRef.value?.contains(target)) return

  closeFlyout()
}

function handleDrop() {
  closeFlyout()
}

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsideClick)
  window.removeEventListener('drop', handleDrop)
  window.removeEventListener('scroll', updatePanelPosition, true)
  window.removeEventListener('resize', updatePanelPosition)
  stopResize()
})

// ==================== Вспомогательные функции ====================

function iconOfBlock(block: BlockStructBlock): string {
  if (block.block_type_icon && typeof block.block_type_icon === 'string') {
    return block.block_type_icon
  }
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

function blockToTest(block: BlockStructBlock): any {
  const b = block as any
  return {
    id: b.id,
    block_type_code: b.block_type_code ?? b.code ?? b.blockTypeCode ?? '',
    settings: b.settings ?? b.default_settings ?? null,
    title: b.title ?? `Блок №${b.id}`,
    description: b.description ?? null,
    is_test: b.is_test ?? false,
    block_type_icon: b.block_type_icon ?? null,
  }
}

function tooltipTextOf(block: BlockStructBlock): string {
  return block.description || block.title || `Блок №${block.id}`
}

// Стили для процедурных заданий
function getProcCardClass(complexity: number | null | undefined) {
  const v = complexity ?? 0
  if (v <= 0.3) return 'border-emerald-500/40 hover:border-emerald-500'
  if (v <= 0.6) return 'border-amber-500/40 hover:border-amber-500'
  return 'border-rose-500/40 hover:border-rose-500'
}

function getProcProgressColor(complexity: number | null | undefined): string {
  const v = complexity ?? 0
  if (v <= 0.3) return 'var(--ui-success)'
  if (v <= 0.6) return 'var(--ui-warning)'
  return 'var(--ui-error)'
}

function getProcProgressValue(complexity: number | null | undefined): number {
  return Math.max(1, Math.round((complexity ?? 0) * 50))
}

function getProcIcon(complexity: number | null | undefined): string {
  const v = complexity ?? 0
  if (v <= 0.3) return 'i-lucide-book-open'
  if (v <= 0.6) return 'i-lucide-zap'
  return 'i-lucide-trophy'
}

function getProcIconClass(complexity: number | null | undefined): string {
  const v = complexity ?? 0
  if (v <= 0.3) return 'text-emerald-500'
  if (v <= 0.6) return 'text-amber-500'
  return 'text-rose-500'
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

// ==================== Drag & drop ====================

let blockDragActive = false
let collectionDragActive = false
let procDragActive = false

function onBlockDragStart(e: DragEvent, type: BlockStructItem, block: BlockStructBlock) {
  if (!e.dataTransfer) return
  if (block.id <= 0) {
    e.preventDefault()
    return
  }

  blockDragActive = true
  const source = { type, block }
  ;(window as any).__draggedBlockSource = source
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('text/plain', String(block.id))
}

function onCollectionTaskDragStart(e: DragEvent) {
  if (!e.dataTransfer) return
  collectionDragActive = true
  const source = { isCollectionTask: true }
  ;(window as any).__draggedBlockSource = source
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('text/plain', 'collection_task')
}

function onProcTaskDragStart(e: DragEvent, test: any) {
  if (!e.dataTransfer) return
  procDragActive = true

  const settings = test.settings ? JSON.parse(JSON.stringify(test.settings)) : null
  ;(window as any).__draggedBlockSource = {
    fromSearch: true,
    block: {
      id: test.id,
      block_type_code: test.block_type_code ?? test.code ?? '',
      settings,
      is_test: true,
    },
  }

  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('text/plain', String(test.id))
}

function onBlockDragEnd() {
  ;(window as any).__draggedBlockSource = null
  setTimeout(() => {
    blockDragActive = false
    collectionDragActive = false
    procDragActive = false
  }, 50)
}

function onBlockClick(type: BlockStructItem, block: BlockStructBlock) {
  if (blockDragActive) return
  emit('select-block', { type, block })
}

function onTestClick(test: any) {
  emit('select-test', test)
}
</script>

<template>
  <div ref="containerRef">
    <LoadingOverlay :loading="props.pending && props.depth === 0">
      <div v-if="props.pending && props.depth === 0" class="px-1 py-2 text-center text-[13px] text-(--ui-text-muted)">
        Загрузка…
      </div>
      <div v-else-if="props.error && props.depth === 0" class="px-1 py-2 text-center text-[13px] text-(--ui-text-muted)">
        Не удалось загрузить структуру
      </div>
      <div v-else-if="props.structItems.length === 0 && props.depth === 0" class="px-1 py-2 text-center text-[13px] text-(--ui-text-muted)">
        Пока ничего нет
      </div>

      <div
        v-else
        class="flex flex-col gap-0.5"
        :class="depth > 0 ? 'mt-0.5 ml-0.5 pl-1 border-l border-default' : 'p-1'"
      >
        <!-- Кнопки типов -->
        <div
          v-for="type in props.structItems"
          :key="type.id"
          class="border bg-(--ui-bg) transition-colors hover:border-(--ui-primary)"
          :class="activeType?.id === type.id
            ? 'border-(--ui-primary)'
            : 'border-(--ui-border)'"
        >
          <button
            type="button"
            class="relative flex w-full items-center gap-1 px-1 py-1 text-left text-[13px] text-(--ui-text) transition-colors hover:bg-(--ui-bg-muted)"
            :class="activeType?.id === type.id ? 'bg-(--ui-primary-muted)/10' : ''"
            @click="toggleType(type, $event)"
            @mouseenter="showTooltip($event, type.description)"
            @mouseleave="hideTooltip"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="h-4 w-4 shrink-0 text-(--ui-text-muted) transition-transform duration-200"
              :class="activeType?.id === type.id ? 'rotate-90 text-(--ui-primary)' : ''"
            />
            <UIcon
              name="i-lucide-folder-tree"
              class="h-4 w-4 shrink-0 text-(--ui-text-muted)"
              :class="activeType?.id === type.id ? '!text-(--ui-primary)' : ''"
            />
            <span class="relative min-w-0 flex-1 overflow-hidden font-medium whitespace-nowrap">
              {{ type.name }}
            </span>
            <span
              class="inline-flex h-[18px] min-w-[22px] shrink-0 items-center justify-center px-1 text-[11px] font-semibold tabular-nums"
              :class="type.blocks_count === 0 ? 'text-(--ui-text-muted)' : 'text-(--ui-primary)'"
              :style="{ background: type.blocks_count === 0 ? 'var(--ui-bg-muted)' : 'color-mix(in srgb, var(--ui-primary) 10%, transparent)' }"
            >
              {{ type.blocks_count }}
            </span>
          </button>

          <LessonBlocksIndex
            v-if="type.children?.length"
            :struct-items="type.children"
            :depth="props.depth + 1"
            :taxonomy-ids="props.taxonomyIds"
            @select-block="emit('select-block', $event)"
            @select-test="emit('select-test', $event)"
          />
        </div>

        <!-- Кнопка «Добавить задание из коллекции» -->
        <div
          v-if="props.depth === 0"
          draggable="true"
          class="mt-1 flex items-center justify-center gap-1 border border-dashed px-1 py-1 text-[13px] font-medium cursor-grab transition-colors active:cursor-grabbing select-none"
          :class="showTestsSearch
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-primary/40 bg-primary/5 text-primary hover:bg-primary/10'"
          @dragstart="onCollectionTaskDragStart"
          @dragend="onBlockDragEnd"
          @click="openCollection"
        >
          <UIcon
            :name="showTestsSearch ? 'i-lucide-chevron-up' : 'i-lucide-package-plus'"
            class="size-4 shrink-0"
          />
          <span>Добавить задание из коллекции</span>
        </div>

        <!-- Кнопка «Добавить динамическое задание» -->
        <div
          v-if="props.depth === 0"
          draggable="true"
          class="mt-1 flex items-center justify-center gap-1 border border-dashed px-1 py-1 text-[13px] font-medium cursor-grab transition-colors active:cursor-grabbing select-none"
          :class="showProcSearch
            ? 'border-yellow-500 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
            : 'border-yellow-500/40 bg-yellow-500/5 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10'"
          @click="openProcSearch"
        >
          <UIcon
            :name="showProcSearch ? 'i-lucide-chevron-up' : 'i-lucide-dices'"
            class="size-4 shrink-0"
          />
          <span>Добавить динамическое задание</span>
        </div>
      </div>
    </LoadingOverlay>
  </div>

  <!-- Выезжающая панель (Tilda-style) -->
  <Teleport to="body">
    <Transition name="flyout-fade">
      <div
        v-if="activeType || showTestsSearch || showProcSearch"
        ref="flyoutRef"
        class="group fixed z-[100] flex flex-col bg-(--ui-bg) border border-(--ui-border) overflow-hidden"
        :style="{ ...panelStyle, width: `${panelWidth}px` }"
        @click.stop
      >
        <!-- Шапка панели с управлением колонками -->
        <div class="flex items-center justify-between gap-1 px-1 py-1 border-b border-(--ui-border) bg-(--ui-bg-elevated) shrink-0">
          <span class="text-[11px] font-bold uppercase tracking-widest text-(--ui-text-muted) truncate">
            {{ showTestsSearch ? 'Коллекция заданий' : showProcSearch ? 'Динамические задания' : activeType?.name }}
          </span>

          <div class="flex items-center gap-1">
            <!-- Переключатель колонок -->
            <div class="inline-flex items-center border border-(--ui-border) overflow-hidden">
              <button
                type="button"
                class="inline-flex items-center justify-center w-5 h-5 transition-colors"
                :class="columns === 1
                  ? 'bg-primary text-white'
                  : 'text-(--ui-text-muted) hover:bg-(--ui-bg-elevated)'"
                title="Одна колонка"
                @click="columns = 1"
              >
                <UIcon name="i-lucide-rectangle-vertical" class="size-3" />
              </button>
              <button
                type="button"
                class="inline-flex items-center justify-center w-5 h-5 transition-colors border-l border-(--ui-border)"
                :class="columns === 2
                  ? 'bg-primary text-white'
                  : 'text-(--ui-text-muted) hover:bg-(--ui-bg-elevated)'"
                title="Две колонки"
                @click="columns = 2"
              >
                <UIcon name="i-lucide-layout-grid" class="size-3" />
              </button>
            </div>

            <!-- Кнопка закрытия -->
            <button
              type="button"
              class="p-0.5 text-(--ui-text-muted) hover:bg-(--ui-bg) hover:text-(--ui-text) transition-colors"
              @click="closeFlyout"
            >
              <UIcon name="i-lucide-x" class="size-4" />
            </button>
          </div>
        </div>

        <!-- Контент панели со скроллом -->
        <div class="flex-1 overflow-y-auto p-1 min-h-0
          [scrollbar-width:thin] [scrollbar-color:transparent_transparent]
          hover:[scrollbar-color:var(--ui-border)_transparent]
          [&::-webkit-scrollbar]:w-1
          [&::-webkit-scrollbar-track]:bg-transparent
          [&::-webkit-scrollbar-thumb]:bg-transparent
          hover:[&::-webkit-scrollbar-thumb]:bg-[var(--ui-border)]
          [&::-webkit-scrollbar-thumb]:rounded-none">

          <!-- Если открыт TestsSearch -->
          <div v-if="showTestsSearch" class="w-full min-w-0 h-full">
            <TestsSearch
              :autonomous="true"
              :selected-taxonomy-id="primaryTaxonomyId"
              :columns="columns"
              :draggable="true"
              @select-test="onTestClick"
            />
          </div>

          <!-- Если открыт список процедурных заданий -->
          <div v-else-if="showProcSearch" class="flex flex-col gap-1 w-full min-w-0">
            <div v-if="procLoading" class="px-2 py-4 text-center text-xs text-(--ui-text-muted)">
              Загрузка...
            </div>
            <div v-else-if="procTests.length === 0" class="px-2 py-4 text-center text-xs text-(--ui-text-muted)">
              Нет доступных заданий
            </div>
            <div
              v-else
              class="grid gap-1 w-full min-w-0"
              :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'"
            >
              <div
                v-for="test in procTests"
                :key="test.id"
                class="group flex flex-col w-full min-w-0 border-l-[3px] border-y border-r border-(--ui-border) bg-(--ui-bg) overflow-hidden cursor-grab active:cursor-grabbing transition-all duration-200 hover:opacity-90 select-none"
                :class="getProcCardClass(test.complexity)"
                draggable="true"
                @dragstart="onProcTaskDragStart($event, test)"
                @dragend="onBlockDragEnd"
              >
                <div class="flex items-center gap-2 px-1.5 py-1.5">
                  <UIcon
                    :name="getProcIcon(test.complexity)"
                    class="h-3.5 w-3.5 shrink-0"
                    :class="getProcIconClass(test.complexity)"
                  />
                  <span class="shrink-0 text-[11.5px] font-medium text-(--ui-text)">
                    #{{ test.id }}
                  </span>

                  <!-- Статичный кастомный прогресс-бар с анимацией 0.25s -->
                  <div class="flex-1 h-2 bg-(--ui-bg-elevated) border border-(--ui-border) rounded-full overflow-hidden min-w-[30px]">
                    <div
                      class="h-full rounded-full transition-all duration-250 ease-out"
                      :style="{
                        width: `${animatedWidths[test.id] || 0}%`,
                        backgroundColor: getProcProgressColor(test.complexity)
                      }"
                    ></div>
                  </div>

                  <span class="shrink-0 text-[10px] text-(--ui-text-muted) font-mono w-4 text-right">
                    {{ getProcProgressValue(test.complexity) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Если открыт список блоков типа -->
          <div v-else-if="activeType">
            <div
              v-if="!activeType.blocks?.length"
              class="px-1 py-2 text-center text-xs text-(--ui-text-muted)"
            >
              В этой категории нет блоков
            </div>

            <div
              v-else
              class="grid gap-1 w-full min-w-0"
              :class="columns === 1 ? 'grid-cols-1' : 'grid-cols-2'"
            >
              <div
                v-for="block in activeType.blocks"
                :key="block.id"
                data-preview-source
                class="group flex flex-col w-full min-w-0 border border-(--ui-border) bg-(--ui-bg) overflow-hidden cursor-grab active:cursor-grabbing transition-[border-color,box-shadow] hover:border-(--ui-primary) select-none"
                draggable="true"
                @dragstart="onBlockDragStart($event, activeType, block)"
                @dragend="onBlockDragEnd"
                @mouseenter="showTooltip($event, tooltipTextOf(block))"
                @mouseleave="hideTooltip"
                @click="onBlockClick(activeType, block)"
              >
                <div class="flex items-center gap-1 px-1 py-1 border-b border-(--ui-border) shrink-0">
                  <UIcon
                    :name="iconOfBlock(block)"
                    class="h-3.5 w-3.5 shrink-0 text-(--ui-text-muted) transition-colors group-hover:text-(--ui-primary)"
                  />
                  <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-medium text-(--ui-text)">
                    {{ block.title || `Блок №${block.id}` }}
                  </span>
                  <span class="shrink-0 font-mono text-[10px] text-(--ui-text-muted)">
                    #{{ block.id }}
                  </span>
                </div>

                <div class="relative w-full min-w-0 overflow-hidden bg-(--ui-bg-muted)/30">
                  <div class="pointer-events-none w-full min-w-0">
                    <TestListElement :test="blockToTest(block)" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Ресайзер ширины панели -->
        <div
          class="absolute top-0 right-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/20 z-50 flex items-center justify-center transition-colors"
          @pointerdown="startResize"
        >
          <div class="w-px h-8 bg-(--ui-border) opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Тултип -->
  <Teleport to="body">
    <Transition name="struct-tooltip-fade">
      <div
        v-if="tooltip.visible"
        class="pointer-events-none fixed z-[9999] max-w-[260px] min-w-[80px] -translate-x-1/2 -translate-y-full bg-gray-900/95 px-1 py-1 text-center text-[11px] leading-snug font-normal text-white shadow-md"
        :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
      >
        {{ tooltip.text }}
        <span class="absolute top-full left-1/2 -translate-x-1/2 border-[4px] border-transparent border-t-gray-900/95" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Анимация появления панели */
.flyout-fade-enter-active,
.flyout-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.flyout-fade-enter-from,
.flyout-fade-leave-to {
  opacity: 0;
  transform: translateX(-4px);
}

/* Анимация тултипа */
.struct-tooltip-fade-enter-active,
.struct-tooltip-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.struct-tooltip-fade-enter-from,
.struct-tooltip-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-100% + 4px));
}
</style>
