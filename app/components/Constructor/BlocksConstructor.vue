<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted, computed, watch } from 'vue'
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
  id: number
  code: string
  block_type_id: number,
  title: string
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

// ==================== Роутер / query ====================

const route = useRoute()
const router = useRouter()

// ==================== Хелпер: иконка ====================

function iconOf(type: BlockType): string {
  return (type.default_settings?.icon as string | undefined) ?? 'i-lucide-square'
}

// ==================== Выбранный блок ====================

const editingBlock = ref<BlockItem | null>(null)

function createBlockFromType(type: BlockType): BlockItem {
  return {
    id: 0,
    code: type.code,
    block_type_id: type.id,
    title: type.name,
    description: type.description ?? '',
    icon: iconOf(type),
    schema: type.schema ?? [],
    default_settings: type.default_settings ?? {},
    settings: structuredClone(type.default_settings ?? {}),
  }
}

function addBlock(type: BlockType) {
  editingBlock.value = createBlockFromType(type)

  router.replace({
    query: { ...route.query, addBlock: type.code },
  })
}

// Реакция на ?addBlock=<code> в URL:
// — срабатывает при открытии страницы (immediate)
// — и когда подгрузятся blockTypes (async)
watch(
  () => [route.query.addBlock, blockTypes.value] as const,
  ([code, types]) => {
    if (!code || typeof code !== 'string') return
    if (!types) return
    if (editingBlock.value?.code === code) return

    const type = types.find((t) => t.code === code)
    if (!type) return

    editingBlock.value = createBlockFromType(type)
  },
  { immediate: true },
)

// Заглушка: получить список блоков по коду типа
function GetBlocksList(code: string): BlockType[] {
  // eslint-disable-next-line no-console
  console.log('[GetBlocksList] stub called with code =', code)
  return []
}

// ==================== Обновление настроек выбранного блока ====================

function updateSelectedSettings(value: Record<string, unknown>) {
  if (!editingBlock.value) return
  editingBlock.value.settings = value
}

// ==================== Очистка query ====================

function clearAddBlockQuery() {
  if (!('addBlock' in route.query)) return

  const { addBlock: _drop, ...rest } = route.query
  router.replace({ query: rest })
}

// ==================== Сохранение ====================

const saving = ref(false)

// ==================== Сохранение ====================

interface BlockResource {
  id: number
  block_type_id: number
  code: string
  name: string
  title: string | null
  description: string | null
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}



async function save() {
  const block = editingBlock.value
  if (!block) return

  saving.value = true
  try {
    const { data } = await api.post<{ data: BlockResource }>('/blocks', {
      block_type_id: block.block_type_id,   // ← было block.code (строка) — надо число
      title:         block.name,
      description:   block.description,
      settings:      block.settings,
    })

    // Обновляем editingBlock данными с сервера (реальный id и т.п.)
    editingBlock.value = {
      ...block,
      id: data.data.id,
      description: data.data.description ?? '',
      settings: data.data.settings ?? block.settings,
    }

    // Чистим ?addBlock=... из URL после успешного сохранения
    clearAddBlockQuery()
  } finally {
    saving.value = false
  }
}

// ==================== Сброс ====================

function reset() {
  editingBlock.value = null
  clearAddBlockQuery()
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
              <div
                v-for="type in blockTypes ?? []"
                :key="type.code"
                class="palette-item"
                :title="type.description ?? type.name"
              >
                <!-- Кнопка «+» — создаёт новый editingBlock из типа -->
                <button
                  type="button"
                  class="palette-add"
                  :aria-label="`Добавить блок «${type.name}»`"
                  @click.stop="addBlock(type)"
                >
                  <UIcon name="i-lucide-plus" class="w-4 h-4 shrink-0" />
                </button>

                <!-- Название — заглушка GetBlocksList -->
                <button
                  type="button"
                  class="palette-name"
                  @click.stop="GetBlocksList(type.code)"
                >
                  <UIcon :name="iconOf(type)" class="w-4 h-4 shrink-0" />
                  <span class="truncate">{{ type.name }}</span>
                </button>
              </div>
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

      <!-- === ЦЕНТР: превью блока === -->
      <main class="panel panel-center">
        <header class="panel-header">
          <div class="panel-header-row">
            <span>Структура</span>
            <UButton
              v-if="editingBlock"
              icon="i-lucide-rotate-ccw"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="reset"
            >
              Сбросить
            </UButton>
          </div>
        </header>
        <div class="panel-body">
          <div v-if="!editingBlock" class="empty-state">
            Нет блока. Добавьте из палитры слева.
          </div>

          <div v-else class="bg-default w-full max-w-[640px] mx-auto">
            <TextBlock
              :key="editingBlock.id"
              :mode="'body'"
              v-model="editingBlock.settings"
            />
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
              :disabled="!editingBlock || saving"
              @click="save"
            >
              Сохранить
            </UButton>
          </div>
        </header>
        <div class="panel-body">
          <LoadingOverlay :loading="saving">
            <div v-if="!editingBlock" class="empty-state">
              Выберите блок в центре.
            </div>

            <BlocksSettingsPanel
              v-else
              :settings="editingBlock.settings"
              v-model:title="editingBlock.title"
              v-model:description="editingBlock.description"
              @update:settings="updateSelectedSettings"
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
  gap: 6px;
  padding: 4px;
  border-radius: 6px;
  border: 1px solid var(--ui-border, #e5e7eb);
  background: var(--ui-bg-elevated, #f9fafb);
  font-size: 13px;
  color: var(--ui-text, #111827);
  transition: border-color 0.15s, background 0.15s;
}

.palette-item:hover {
  border-color: var(--ui-primary, #3b82f6);
  background: var(--ui-bg, #ffffff);
}

.palette-add {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 5px;
  border: 1px solid var(--ui-border, #e5e7eb);
  background: var(--ui-bg, #ffffff);
  color: var(--ui-text, #111827);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.palette-add:hover {
  border-color: var(--ui-primary, #3b82f6);
  background: var(--ui-primary, #3b82f6);
  color: #ffffff;
}

.palette-add:active {
  transform: translateY(1px);
}

.palette-name {
  flex: 1 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 13px;
  color: inherit;
  cursor: pointer;
  border-radius: 5px;
  transition: background 0.15s;
}

.palette-name:hover {
  background: var(--ui-bg-muted, rgba(59, 130, 246, 0.08));
}

.palette-name:active {
  background: var(--ui-bg-muted, rgba(59, 130, 246, 0.14));
}

/* ==================== Пустое состояние ==================== */

.empty-state {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--ui-text-muted, #9ca3af);
}
</style>
