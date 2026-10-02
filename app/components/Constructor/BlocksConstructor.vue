<script setup lang="ts">
import { ref, onBeforeUnmount, computed } from 'vue'
import BlocksSettingsPanel from '~/components/Constructor/BlocksSettingsPanel.vue'
import TextBlock from '~/components/Constructor/Components/text_image.vue'



// ==================== Типы ====================

interface BlockType {
  id: number
  code: string
  type: 'info' | 'task'
  name: string
  description: string | null
  default_settings: {
    icon?: string
    [key: string]: unknown
  }
  schema: SettingNode[]
  created_at?: string
  updated_at?: string
}

interface BlockItem {
  id: string
  code: string
  name: string
  icon: string
  schema: SettingNode[]
  default_settings: Record<string, unknown>
  settings: Record<string, unknown>
}

// ==================== Ресайз панелей ====================

const MIN_LEFT = 180
const MAX_LEFT = 500
const MIN_RIGHT = 200
const MAX_RIGHT = 600

const leftWidth = ref(260)
const rightWidth = ref(500)

type Side = 'left' | 'right' | null
const resizing = ref<Side>(null)

function startResize(side: Exclude<Side, null>, e: MouseEvent) {
  e.preventDefault()
  resizing.value = side
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function onMove(e: MouseEvent) {
  if (resizing.value === 'left') {
    leftWidth.value = clamp(e.clientX, MIN_LEFT, MAX_LEFT)
  } else if (resizing.value === 'right') {
    rightWidth.value = clamp(window.innerWidth - e.clientX, MIN_RIGHT, MAX_RIGHT)
  }
}

function onUp() {
  resizing.value = null
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onMove)
  document.removeEventListener('mouseup', onUp)
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

onBeforeUnmount(onUp)

const gridStyle = computed(() => ({
  gridTemplateColumns: `${leftWidth.value}px 4px 1fr 4px ${rightWidth.value}px`,
}))

// ==================== Загрузка типов блоков ====================

const api = useApi()

const { data: blockTypes, pending, error } = await useAsyncData(
  'block-types',
  () => api.get<BlockType[]>('/block-types'),
)

// ==================== Хелпер: иконка ====================

function iconOf(type: BlockType): string {
  return (type.default_settings?.icon as string | undefined) ?? 'i-lucide-square'
}

// ==================== Список блоков ====================

const blocks = ref<BlockItem[]>([])
const selectedBlockId = ref<string | null>(null)

function selectBlock(id: string) {
  selectedBlockId.value = id
}

function removeBlock(id: string) {
  blocks.value = blocks.value.filter((b) => b.id !== id)
  if (selectedBlockId.value === id) selectedBlockId.value = null
}

function addBlock(type: BlockType) {
  const item: BlockItem = {
    id: `b${Date.now()}`,
    code: type.code,
    name: type.name,
    icon: iconOf(type),
    schema: type.schema ?? [],
    default_settings: type.default_settings ?? {},
    settings: structuredClone(type.default_settings ?? {}),
  }

  blocks.value.push(item)
  selectedBlockId.value = item.id
}

const selectedBlock = computed(() =>
  blocks.value.find((b) => b.id === selectedBlockId.value) ?? null,
)

// ==================== Обновление настроек выбранного блока ====================

function updateSelectedSettings(value: Record<string, unknown>) {
  const block = selectedBlock.value
  if (! block) return
  block.settings = value
}
</script>

<template>
  <div class="constructor-root">
    <div class="constructor-grid" :style="gridStyle">
      <!-- === ЛЕВАЯ ПАНЕЛЬ: типы блоков === -->
      <aside class="panel panel-left">
        <header class="panel-header">Типы блоков</header>
        <div class="panel-body">
          <div class="palette-list">
            <div v-if="pending" class="empty-state">Загрузка…</div>
            <div v-else-if="error" class="empty-state">
              Не удалось загрузить типы блоков
            </div>

            <template v-else>
              <button
                v-for="type in blockTypes ?? []"
                :key="type.code"
                type="button"
                class="palette-item"
                :title="type.description ?? type.name"
                @click="addBlock(type)"
              >
                <UIcon :name="iconOf(type)" class="w-4 h-4 shrink-0" />
                <span class="truncate">{{ type.name }}</span>
              </button>
            </template>
          </div>
        </div>
      </aside>

      <!-- === ЛЕВЫЙ РЕСАЙЗЕР === -->
      <div
        class="resizer"
        :class="{ 'resizer-active': resizing === 'left' }"
        @mousedown="startResize('left', $event)"
      >
        <div class="resizer-bar" />
      </div>

      <!-- === ЦЕНТР: список блоков === -->
      <main class="panel panel-center">
        <header class="panel-header">Структура</header>
        <div class="panel-body">
          <div v-if="blocks.length === 0" class="empty-state">
            Нет блоков. Добавьте из палитры слева.
          </div>

          <div v-else class="bg-default w-full max-w-[640px] mx-auto">

            <TextBlock
              :mode="body"
              v-model = "selectedBlock.settings"
            />


            <div
              v-show="false"
              v-for="block in blocks"
              :key="block.id"
              class="block-item"
              :class="{ 'block-item-selected': block.id === selectedBlockId }"
              @click="selectBlock(block.id)"
            >
              <UIcon name="i-lucide-grip-vertical" class="w-4 h-4 shrink-0 opacity-50" />
              <UIcon :name="block.icon" class="w-4 h-4 shrink-0" />
              <span class="flex-1 truncate">{{ block.name }}</span>
              <div>{{selectedBlock.settings}}</div>
              <button
                type="button"
                class="block-remove"
                @click.stop="removeBlock(block.id)"
              >
                <UIcon name="i-lucide-x" class="w-4 h-4" />
              </button>
            </div>

          </div>
        </div>
      </main>

      <!-- === ПРАВЫЙ РЕСАЙЗЕР === -->
      <div
        class="resizer"
        :class="{ 'resizer-active': resizing === 'right' }"
        @mousedown="startResize('right', $event)"
      >
        <div class="resizer-bar" />
      </div>

      <!-- === ПРАВАЯ ПАНЕЛЬ: свойства === -->
      <aside class="panel panel-right">
        <header class="panel-header">Свойства</header>
        <div class="panel-body">
          <div v-if="!selectedBlock" class="empty-state">
            Выберите блок в центре.
          </div>

          <BlocksSettingsPanel
            v-else
            :settings="selectedBlock.settings"
            @update:model-value="updateSelectedSettings"
          />
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ==================== Общая структура ==================== */

.constructor-root {
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  background: var(--ui-bg, #ffffff);
}

.constructor-grid {
  display: grid;
  height: 100%;
  width: 100%;
}

.panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.panel-left {
  border-right: 1px solid var(--ui-border, #e5e7eb);
  background: var(--ui-bg, #ffffff);
}

.panel-right {
  border-left: 1px solid var(--ui-border, #e5e7eb);
  background: var(--ui-bg, #ffffff);
}

.panel-center {

}

.panel-header {
  flex-shrink: 0;
  height: 48px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-muted, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--ui-border, #e5e7eb);
}

.panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

/* ==================== Ресайзеры ==================== */

.resizer {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
  user-select: none;
}

.resizer:hover,
.resizer-active {
  background: var(--ui-primary, #3b82f6);
}

.resizer-bar {
  width: 2px;
  height: 32px;
  border-radius: 2px;
  background: var(--ui-border, #d1d5db);
  transition: background 0.15s ease;
}

.resizer:hover .resizer-bar,
.resizer-active .resizer-bar {
  background: #ffffff;
}

/* ==================== Палитра (левая) ==================== */

.palette-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #e5e7eb);
  background: var(--ui-bg-elevated, #f9fafb);
  text-align: left;
  font-size: 13px;
  color: var(--ui-text, #111827);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.palette-item:hover {
  border-color: var(--ui-primary, #3b82f6);
  background: var(--ui-bg, #ffffff);
}

/* ==================== Список блоков (центр) ==================== */

.blocks-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
}

.block-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #e5e7eb);
  background: var(--ui-bg, #ffffff);
  font-size: 14px;
  color: var(--ui-text, #111827);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.block-item:hover {
  border-color: var(--ui-primary, #3b82f6);
}

.block-item-selected {
  border-color: var(--ui-primary, #3b82f6);
  box-shadow: 0 0 0 2px var(--ui-primary, #3b82f6) inset;
}

.block-remove {
  flex-shrink: 0;
  padding: 2px;
  border-radius: 4px;
  color: var(--ui-text-muted, #6b7280);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.block-remove:hover {
  color: #dc2626;
  background: #fee2e2;
}

/* ==================== Пустое состояние ==================== */

.empty-state {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--ui-text-muted, #9ca3af);
}
</style>
