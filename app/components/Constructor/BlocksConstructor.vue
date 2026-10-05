<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted, computed } from 'vue'
import BlocksSettingsPanel from '~/components/Constructor/BlocksSettingsPanel.vue'
import TextBlock from '~/components/Constructor/Components/text_image.vue'
import LoadingOverlay from '~/components/LoadingOverlay.vue'

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
  description: string
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

// Смещение курсора относительно границы в момент захвата.
// Компенсирует ширину ресайзера, чтобы панель не «прыгала» на 4px.
let startOffset = 0

function startResize(side: Exclude<Side, null>, e: PointerEvent) {
  e.preventDefault()

  resizing.value = side

  if (side === 'left') {
    startOffset = e.clientX - leftWidth.value
  } else {
    startOffset = window.innerWidth - e.clientX - rightWidth.value
  }

  const root = document.documentElement
  root.style.cursor = 'col-resize'
  root.style.userSelect = 'none'
}

function onPointerMove(e: PointerEvent) {
  if (!resizing.value) return

  const winW = window.innerWidth

  if (resizing.value === 'left') {
    // не даём левой панели съесть место под правую и центр
    const maxByWindow = winW - rightWidth.value - 4 - 4 - MIN_RIGHT - 200
    const max = Math.max(MIN_LEFT, Math.min(MAX_LEFT, maxByWindow))

    leftWidth.value = clamp(e.clientX - startOffset, MIN_LEFT, max)
  } else {
    const maxByWindow = winW - leftWidth.value - 4 - 4 - MIN_LEFT - 200
    const max = Math.max(MIN_RIGHT, Math.min(MAX_RIGHT, maxByWindow))

    rightWidth.value = clamp(winW - e.clientX - startOffset, MIN_RIGHT, max)
  }
}

function endResize() {
  if (!resizing.value) return

  resizing.value = null

  const root = document.documentElement
  root.style.cursor = ''
  root.style.userSelect = ''
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endResize)
  window.addEventListener('pointercancel', endResize)
  window.addEventListener('blur', endResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endResize)
  window.removeEventListener('pointercancel', endResize)
  window.removeEventListener('blur', endResize)
})

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

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
    name: type.description,
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

// ==================== Сохранение ====================

const saving = ref(false)

async function save() {
  const block = selectedBlock.value
  if (! block) return

  saving.value = true
  try {
    // TODO: заменить на реальный запрос к API
    // await api.post('/blocks', {
    //   code: block.code,
    //   settings: block.settings,
    // })
    await new Promise((resolve) => setTimeout(resolve, 800)) // заглушка
  } finally {
    saving.value = false
  }
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
        @pointerdown="startResize('left', $event)"
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
              v-model="selectedBlock.settings"
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
              <div>{{ selectedBlock.settings }}</div>
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
        @pointerdown="startResize('right', $event)"
      >
        <div class="resizer-bar" />
      </div>

      <!-- === ПРАВАЯ ПАНЕЛЬ: свойства === -->
      <aside class="panel panel-right">
        <header class="panel-header">
          <div class="panel-header-row">
            <span>Свойства</span>
            <UButton
              icon="i-lucide-save"
              size="xs"
              color="primary"
              variant="soft"
              :loading="saving"
              :disabled="!selectedBlock || saving"
              @click="save"
            >
              Сохранить
            </UButton>
          </div>
        </header>
        <div class="panel-body">
          <LoadingOverlay :loading="saving">
            <div v-if="!selectedBlock" class="empty-state">
              Выберите блок в центре.
            </div>

            <BlocksSettingsPanel
              v-else
              :settings="selectedBlock.settings"
              :id="selectedBlock.id"
              :title="selectedBlock.title"
              :description="selectedBlock.description"
              @update:model-value="updateSelectedSettings"
            />
          </LoadingOverlay>
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

/* Строка внутри правого хедера: заголовок + кнопка */
.panel-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
}

.panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

/* ==================== Ресайзеры ==================== */

.resizer {
  position: relative;
  width: 4px;
  cursor: col-resize;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
  user-select: none;
  touch-action: none;
}

/* Широкая невидимая зона захвата: +4px влево и вправо от полосы.
   Именно это чинит «промахи» мышью по 4px полосе. */
.resizer::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  right: -4px;
  cursor: col-resize;
  z-index: 1;
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
  pointer-events: none;
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
