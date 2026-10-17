<script setup lang="ts">
// app/components/Constructor/BlocksConstructor.vue
//
// Конструктор блоков (библиотека).
// Задачи:
//   1. Левая панель — типы блоков + список сохранённых блоков.
//   2. Центр — режим списка ИЛИ редактор блока (TextBlock).
//   3. Правая панель — BlocksSettingsPanel для активного блока.
//
// Изменения относительно предыдущей версии:
//   • mergeSchemaWithSaved заменён на mergeFlat (из ~/utils/constructors).
//   • При сохранении settings сжимается через unmergeFlat.
//   • При загрузке settings разворачивается через mergeFlat.
//   • Убран FileContainer и payload.files/payload.images — изображения
//     теперь живут внутри settings (images.gallery.default) и сохраняются
//     вместе с деревом настроек.

import { ref, computed, watch } from 'vue'
import BlocksSettingsPanel from '~/components/Constructor/BlocksSettingsPanel.vue'
import TextBlock from '~/components/Constructor/Components/text_image.vue'
import LoadingOverlay from '~/components/LoadingOverlay.vue'
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'
import { mergeFlat, unmergeFlat } from '~/utils/constructors'

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
  settings: Record<string, any> | SettingNode[]
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

function iconOfSettings(settings: Record<string, any> | SettingNode[] | undefined): string {
  if (Array.isArray(settings)) {
    const iconField = settings.find((f: any) => f.key === 'icon')
    return (iconField?.default as string | undefined) ?? 'i-lucide-square'
  }
  if (settings && typeof settings === 'object') {
    const icon = (settings as Record<string, any>).icon
    return typeof icon === 'string' && icon ? icon : 'i-lucide-square'
  }
  return 'i-lucide-square'
}

// ==================== Выбранный блок ====================

const editingBlock = ref<BlockItem | null>(null)
const blockKey = ref(0)

// ==================== Создание блока ====================

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

      // Разворачиваем плоские переопределения в полное дерево
      const fullSettings = mergeFlat(
        type.default_settings,
        isPlainSettings(block.settings) ? block.settings : undefined,
        undefined,
      )

      editingBlock.value = {
        ...item,
        id: block.id,
        title: block.title ?? item.title,
        description: block.description ?? item.description,
        settings: fullSettings,
      }
    } catch (e) {
      console.error('[load block by id] failed', e)
    }
  },
  { immediate: true },
)

/**
 * Проверка: settings — плоский объект переопределений (не массив).
 */
function isPlainSettings(s: unknown): s is Record<string, any> {
  return (
    typeof s === 'object' &&
    s !== null &&
    !Array.isArray(s)
  )
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

// ==================== Сохранение ====================

const saving = ref(false)

async function save() {
  const block = editingBlock.value
  if (!block) return

  saving.value = true
  try {
    const isUpdate = block.id > 0

    // Сжимаем полное дерево в плоские переопределения.
    const compactSettings = unmergeFlat(
      block.settings,
      block.default_settings,
      undefined,
    )

    const payload: Record<string, any> = {
      block_type_id: block.block_type_id,
      title:         block.title,
      description:   block.description,
      settings:      compactSettings,
    }

    const res = isUpdate
      ? await api.put<{ data: BlockResource } | BlockResource>(`/blocks/${block.id}`, payload)
      : await api.post<{ data: BlockResource } | BlockResource>('/blocks', payload)

    const saved: BlockResource =
      (res as { data?: BlockResource }).data ?? (res as BlockResource)

    // ВАЖНО: Берем обновленные настройки от сервера (где temp заменены на store)
    // и разворачиваем их обратно в полное дерево
    const fullSettings = mergeFlat(
      block.default_settings,
      isPlainSettings(saved.settings) ? saved.settings : undefined,
      undefined,
    )

    editingBlock.value = {
      ...block,
      id:          saved.id,
      title:       saved.title ?? block.title,
      description: saved.description ?? '',
      settings:    fullSettings, // <-- Перезаписываем настройки ответом сервера!
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
  <ConstructPanels
    left-title="Типы блоков"
    :main-title="centerTitle"
    right-title="Свойства"
    :show-viewport-picker="!!editingBlock"
  >
    <!-- ==================== LEFT ==================== -->
    <template #left>
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
            <button
              type="button"
              class="palette-add"
              :aria-label="`Добавить блок «${type.name}»`"
              @click.stop="addBlock(type)"
            >
              <UIcon name="i-lucide-plus" class="w-4 h-4 shrink-0" />
            </button>

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
    </template>

    <!-- ==================== MAIN HEADER ==================== -->
    <template #main-header>
      <div class="main-header-inner">
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
    </template>

    <!-- ==================== MAIN ==================== -->
    <template #main>
      <!-- === Режим редактирования конкретного блока === -->
      <template v-if="editingBlock">
        <LoadingOverlay :loading="saving">
          <TextBlock
            :key="`${editingBlock.id}-${blockKey}`"
            :mode="'body'"
            v-model="editingBlock.settings"
            :id="editingBlock.id || 0"
            :show-to-delete-images="true"
          />
        </LoadingOverlay>
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
                class="size-16 shrink-0 text-muted"
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
    </template>

    <!-- ==================== RIGHT HEADER ==================== -->
    <template #right-header>
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
    </template>

    <!-- ==================== RIGHT ==================== -->
    <template #right>
      <LoadingOverlay :loading="saving">
        <div v-if="!editingBlock" class="empty-state">
          Выберите блок в центре.
        </div>

        <BlocksSettingsPanel
          v-else
          mode="admin"
          v-model:id="editingBlock.id"
          v-model:title="editingBlock.title"
          v-model:description="editingBlock.description"
          v-model:settings="editingBlock.settings"
        />
      </LoadingOverlay>
    </template>
  </ConstructPanels>
</template>

<style scoped>
/* ==================== Заголовок центральной панели ==================== */

.main-header-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
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
