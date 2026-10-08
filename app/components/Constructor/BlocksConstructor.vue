<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted, computed, watch } from 'vue'
import BlocksSettingsPanel from '~/components/Constructor/BlocksSettingsPanel.vue'
import TextBlock from '~/components/Constructor/Components/text_image.vue'
import LoadingOverlay from '~/components/LoadingOverlay.vue'
import FileContainer from '~/components/FileContainer.vue'

// ==================== Типы ====================

interface BlockType {
  id: number
  code: string
  type: 'info' | 'task'
  name: string
  description: string | null
  default_settings: SettingNode[]
  created_at?: string
  updated_at?: string
}

interface BlockItem {
  id: number
  code: string
  block_type_id: number
  title: string
  description: string
  icon: string
  schema: SettingNode[]
  default_settings: SettingNode[]
  settings: SettingNode[]
}

interface BlockResource {
  id: number
  block_type_id: number
  code: string | null
  name: string | null
  title: string | null
  description: string | null
  settings: SettingNode[]
  created_at: string
  updated_at: string
}

interface BlocksPage {
  data: BlockResource[]
  meta: {
    current_page: number
    per_page: number
    total: number
    last_page: number
    from: number | null
    to: number | null
  }
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

function iconOf(type: Pick<BlockType, 'default_settings'>): string {
  const fields = Array.isArray(type.default_settings) ? type.default_settings : []
  const iconField = fields.find((f: any) => f.key === 'icon')
  return (iconField?.default as string | undefined) ?? 'i-lucide-square'
}

function iconOfSettings(settings: SettingNode[] | undefined): string {
  const fields = Array.isArray(settings) ? settings : []
  const iconField = fields.find((f: any) => f.key === 'icon')
  return (iconField?.default as string | undefined) ?? 'i-lucide-square'
}

// ==================== Выбранный блок ====================

const editingBlock = ref<BlockItem | null>(null)
const fileContainerRef = ref<InstanceType<typeof FileContainer> | null>(null)
const blockKey = ref(0)

function createBlockFromType(type: BlockType): BlockItem {
  const schema = Array.isArray(type.default_settings) ? type.default_settings : []

  return {
    id: 0,
    code: type.code,
    block_type_id: type.id,
    title: type.name,
    description: type.description ?? '',
    icon: iconOf(type),
    schema,
    default_settings: type.default_settings,
    settings: structuredClone(schema),
  }
}

function addBlock(type: BlockType) {
  editingBlock.value = createBlockFromType(type)

  router.replace({
    query: { addBlock: type.code },
  })
}

// ==================== Режим списка ====================

const listLoading = ref(false)
const listError = ref<string | null>(null)
const blocksPage = ref<BlocksPage | null>(null)

const listPerPage = 20

const listPage = computed(() => {
  const raw = route.query.page
  const v = Array.isArray(raw) ? raw[0] : raw
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 1
})

const listTypeCode = computed<string | null>(() => {
  const raw = route.query.type
  const v = Array.isArray(raw) ? raw[0] : raw
  return typeof v === 'string' && v ? v : null
})

const listTypeName = computed<string | null>(() => {
  if (!listTypeCode.value) return null
  const t = blockTypes.value?.find((x) => x.code === listTypeCode.value)
  return t?.name ?? listTypeCode.value
})

const centerTitle = computed(() => {
  if (editingBlock.value) {
    return editingBlock.value.id > 0
      ? `Редактирование блока №${editingBlock.value.id}`
      : 'Создание блока'
  }

  if (listTypeCode.value) {
    return `Блоки типа ${listTypeName.value}`
  }

  return 'Все блоки'
})

async function loadBlocks() {
  listLoading.value = true
  listError.value = null
  try {
    const res = await api.get<BlocksPage>('/blocks', {
      params: {
        page: listPage.value,
        per_page: listPerPage,
        ...(listTypeCode.value ? { code: listTypeCode.value } : {}),
      },
    })

    blocksPage.value = res as BlocksPage
  } catch (e) {
    console.error('[loadBlocks] failed', e)
    listError.value = 'Не удалось загрузить список блоков'
    blocksPage.value = null
  } finally {
    listLoading.value = false
  }
}

// ==================== Watch: ?addBlock ====================

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

// ==================== Watch: ?id ====================

watch(
  () => [route.query.id, blockTypes.value] as const,
  async ([id, types]) => {
    if (!id || typeof id !== 'string') return
    if (!types) return

    const numId = Number(id)
    if (!Number.isFinite(numId)) return

    if (editingBlock.value?.id === numId) return

    try {
      const res = await api.get<{ data: BlockResource } | BlockResource>(`/blocks/${numId}`)
      const block = (res as { data?: BlockResource }).data ?? (res as BlockResource)

      const type = types.find((t) => t.id === block.block_type_id)
      if (!type) {
        console.warn('[load block] block_type not found:', block.block_type_id)
        return
      }

      const item = createBlockFromType(type)

      editingBlock.value = {
        ...item,
        id:          block.id,
        title:       block.title ?? item.title,
        description: block.description ?? item.description,
        settings:    mergeSchemaWithSaved(type.default_settings, block.settings),
      }
    } catch (e) {
      console.error('[load block by id] failed', e)
    }
  },
  { immediate: true },
)

function mergeSchemaWithSaved(
  schema: SettingNode[] | undefined,
  saved: SettingNode[] | undefined,
): SettingNode[] {
  if (!Array.isArray(schema)) return saved ?? []

  const savedByKey = new Map<string, SettingNode>()
  for (const item of saved ?? []) {
    if (item?.key) savedByKey.set(item.key, item)
  }

  return schema.map((schemaItem) => {
    const savedItem = savedByKey.get(schemaItem.key)

    if (!savedItem) {
      return structuredClone(schemaItem)
    }

    const merged: SettingNode = {
      ...structuredClone(schemaItem),
      default: savedItem.default ?? schemaItem.default,
    }

    if (schemaItem.children?.length) {
      merged.children = mergeSchemaWithSaved(
        schemaItem.children,
        savedItem.children ?? [],
      )
    }

    return merged
  })
}

// ==================== Watch: список блоков ====================

watch(
  () => [route.query.type, route.query.page, editingBlock.value?.id] as const,
  ([, , editingId]) => {
    if (editingId !== null && editingId !== undefined) return
    loadBlocks()
  },
  { immediate: true },
)

// ==================== Переходы ====================

function openTypeList(code: string) {
  editingBlock.value = null
  router.replace({
    query: { type: code, page: '1' },
  })
}

function showAllBlocks() {
  editingBlock.value = null
  router.replace({
    query: { page: '1' },
  })
}

function openBlock(id: number) {
  router.replace({
    query: { id: String(id) },
  })
}

function goToPage(page: number) {
  router.replace({
    query: {
      ...(listTypeCode.value ? { type: listTypeCode.value } : {}),
      page: String(page),
    },
  })
}

// ==================== Сохранение ====================

const saving = ref(false)

async function save() {
  const block = editingBlock.value
  if (!block) return

  saving.value = true
  try {
    const isUpdate = block.id > 0

    const filesModel = fileContainerRef.value?.getFiles?.() ?? null

    const payload: Record<string, any> = {
      block_type_id: block.block_type_id,
      title:         block.title,
      description:   block.description,
      settings:      block.settings,
    }

    if (filesModel) {
      payload.files  = (filesModel.files  ?? []).filter((f: any) => !f.toDelete)
      payload.images = (filesModel.images ?? []).filter((i: any) => !i.toDelete)
    }

    const res = isUpdate
      ? await api.put<{ data: BlockResource } | BlockResource>(`/blocks/${block.id}`, payload)
      : await api.post<{ data: BlockResource } | BlockResource>('/blocks', payload)

    const saved: BlockResource =
      (res as { data?: BlockResource }).data ?? (res as BlockResource)

    editingBlock.value = {
      ...block,
      id:          saved.id,
      title:       saved.title ?? block.title,
      description: saved.description ?? '',
      settings:    saved.settings ?? block.settings,
    }

    router.replace({
      query: { id: String(saved.id) },
    })

    blockKey.value++
  } finally {
    saving.value = false
  }
}

// ==================== Сброс ====================

function reset() {
  editingBlock.value = null
  router.replace({ query: { page: '1' } })
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
            <!-- Все блоки -->
            <div
              class="palette-item"
              :class="{ 'palette-item-active': !listTypeCode && !editingBlock }"
            >
              <button
                type="button"
                class="palette-name"
                @click.stop="showAllBlocks"
              >
                <UIcon name="i-lucide-list" class="w-4 h-4 shrink-0" />
                <span class="truncate">Все блоки</span>
              </button>
            </div>

            <div v-if="pending" class="empty-state">Загрузка…</div>
            <div v-else-if="error" class="empty-state">
              Не удалось загрузить типы блоков
            </div>

            <template v-else>
              <div
                v-for="type in blockTypes ?? []"
                :key="type.code"
                class="palette-item"
                :class="{ 'palette-item-active': listTypeCode === type.code && !editingBlock }"
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

                <!-- Название — переход к списку блоков этого типа -->
                <button
                  type="button"
                  class="palette-name"
                  @click.stop="openTypeList(type.code)"
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

      <!-- === ЦЕНТР === -->
      <main class="panel panel-center">
        <header class="panel-header">
          <div class="panel-header-row">
            <span>{{ centerTitle }}</span>
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
          <!-- === Режим редактирования конкретного блока === -->
          <template v-if="editingBlock">
            <div class="bg-default w-full max-w-[640px] mx-auto">
              <LoadingOverlay :loading="saving">
                <TextBlock
                  :key="`${editingBlock.id}-${blockKey}`"
                  :mode="'body'"
                  v-model="editingBlock.settings"
                  :id="editingBlock.id || 0"
                  @register-files="fileContainerRef = $event"
                />
              </LoadingOverlay>
            </div>
          </template>

          <!-- === Режим списка блоков === -->
          <template v-else>
            <div v-if="listLoading" class="empty-state">Загрузка…</div>

            <div v-else-if="listError" class="empty-state">
              {{ listError }}
            </div>

            <div
              v-else-if="!blocksPage || blocksPage.data.length === 0"
              class="empty-state"
            >
              {{ listTypeCode ? 'Блоков этого типа пока нет' : 'Блоков пока нет' }}
            </div>

            <template v-else>
              <div class="blocks-list">
                <button
                  v-for="item in blocksPage.data"
                  :key="item.id"
                  type="button"
                  class="block-card"
                  @click="openBlock(item.id)"
                >
                  <UIcon
                    :name="iconOfSettings(item.settings)"
                    class="block-card-icon size-16!"
                  />

                  <div class="block-card-main">
                    <div class="block-card-title">
                      {{ item.title || item.name || `Блок №${item.id}` }}
                    </div>
                    <div v-if="item.description" class="block-card-desc">
                      {{ item.description }}
                    </div>
                    <div class="block-card-meta">
                      <span v-if="item.name" class="block-card-chip">{{ item.name }}</span>
                      <span class="block-card-id">#{{ item.id }}</span>
                    </div>
                  </div>
                  <UIcon name="i-lucide-chevron-right" class="block-card-arrow" />
                </button>
              </div>

              <!-- Пагинация -->
              <div v-if="blocksPage.meta.last_page > 1" class="pagination">
                <UButton
                  icon="i-lucide-chevron-left"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="blocksPage.meta.current_page <= 1"
                  @click="goToPage(blocksPage.meta.current_page - 1)"
                >
                  Назад
                </UButton>

                <span class="pagination-info">
                  {{ blocksPage.meta.current_page }} / {{ blocksPage.meta.last_page }}
                </span>

                <UButton
                  icon="i-lucide-chevron-right"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="blocksPage.meta.current_page >= blocksPage.meta.last_page"
                  @click="goToPage(blocksPage.meta.current_page + 1)"
                >
                  Вперёд
                </UButton>
              </div>
            </template>
          </template>
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
              v-model:id="editingBlock.id"
              v-model:title="editingBlock.title"
              v-model:description="editingBlock.description"
              v-model:settings="editingBlock.settings"
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

.palette-item-active {
  border-color: var(--ui-primary, #3b82f6);
  background: var(--ui-bg, #ffffff);
  box-shadow: 0 0 0 2px var(--ui-primary, #3b82f6) inset;
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

/* ==================== Список блоков (центр) ==================== */

.blocks-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  max-width: 720px;
  margin: 0 auto;
}

.block-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--ui-border, #e5e7eb);
  background: var(--ui-bg, #ffffff);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

.block-card:hover {
  border-color: var(--ui-primary, #3b82f6);
  box-shadow: 0 1px 2px rgba(59, 130, 246, 0.08);
}

.block-card-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: var(--ui-text-muted, #6b7280);
}

.block-card-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.block-card-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--ui-text, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.block-card-desc {
  font-size: 12px;
  color: var(--ui-text-muted, #6b7280);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.block-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.block-card-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--ui-bg-muted, rgba(107, 114, 128, 0.12));
  font-size: 11px;
  font-weight: 500;
  color: var(--ui-text-muted, #6b7280);
}

.block-card-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--ui-text-muted, #9ca3af);
}

.block-card-arrow {
  flex-shrink: 0;
  color: var(--ui-text-muted, #9ca3af);
}

/* ==================== Пагинация ==================== */

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px 12px 24px;
}

.pagination-info {
  font-size: 12px;
  color: var(--ui-text-muted, #6b7280);
  min-width: 60px;
  text-align: center;
}

/* ==================== Пустое состояние ==================== */

.empty-state {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--ui-text-muted, #9ca3af);
}
</style>
