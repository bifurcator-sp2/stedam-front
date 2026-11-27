<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import BlocksSettingsPanel from '~/components/Constructor/BlocksSettingsPanel.vue'
import LoadingOverlay from '~/components/LoadingOverlay.vue'
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'
import BlockRenderer from '~/components/Constructor/BlockRenderer.vue'

// ==================== Типы ====================

interface BlockType {
  code: string
  type?: 'info' | 'task'
  name: string
  description: string | null
  default_settings: SettingNode | null
  icon?: string | null
}

interface BlockItem {
  id: number
  code: string
  title: string
  description: string
  icon: string
  settings: SettingNode | null
  parent_block_index_ids: number[] | null
  published: boolean
  is_test: boolean
  is_proc: boolean
}

interface BlockResource {
  id: number
  code: string | null
  name?: string | null
  title: string | null
  description: string | null
  settings: SettingNode | null
  parent_block_index_ids?: number[] | null
  published?: boolean | null
  is_test?: boolean | null
  is_proc?: boolean | null
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

const blockTypes = ref<BlockType[] | null>(null)
const pending = ref(true)
const error = ref<unknown>(null)

async function loadBlockTypes() {
  pending.value = true
  error.value = null

  try {
    blockTypes.value = await api.get<BlockType[]>('/block-types')
  } catch (e) {
    error.value = e
  } finally {
    pending.value = false
  }
}

onMounted(() => {
  loadBlockTypes()
})

// ==================== Роутер / query ====================

const route = useRoute()
const router = useRouter()

// ==================== Хелпер: иконка ====================

function iconOf(type: Pick<BlockType, 'default_settings' | 'icon'>): string {
  if (type.icon) return type.icon
  const node = type.default_settings
  const icon = node?.children?.find((c: any) => c.key === 'icon')?.default
  return typeof icon === 'string' && icon ? icon : 'i-lucide-square'
}

function iconOfSettings(settings: SettingNode | null | undefined): string {
  if (!settings || typeof settings !== 'object') return 'i-lucide-square'
  const icon = (settings as any).children?.find((c: any) => c.key === 'icon')?.default
  return typeof icon === 'string' && icon ? icon : 'i-lucide-square'
}

// ==================== Выбранный блок ====================

const editingBlock = ref<BlockItem | null>(null)
const previewBlock = ref<BlockItem | null>(null)
const blockKey = ref(0)

// id превью-блока для подсветки карточки (computed — без сужения типов в шаблоне)
const previewId = computed(() => previewBlock.value?.id ?? null)

const rightTitle = computed(() => (previewBlock.value ? 'Просмотр' : 'Свойства'))

// ==================== Масштабирование превью (как в LessonsConstructor) ====================
// Блок рендерится в виртуальной ширине VIRTUAL_WIDTH и зумится под фактическую
// ширину контейнера правой панели — при ресайзе панели превью пересчитывается.

const PREVIEW_VIRTUAL_WIDTH = 800

const previewContainerRef = ref<HTMLElement | null>(null)
const previewZoom = ref(1)

let previewResizeObserver: ResizeObserver | null = null

function updatePreviewZoom(width: number) {
  if (width > 0) {
    previewZoom.value = width / PREVIEW_VIRTUAL_WIDTH
  }
}

function observePreviewContainer(el: Element | { $el?: unknown } | null) {
  if (!(el instanceof HTMLElement)) {
    previewContainerRef.value = null
    previewResizeObserver?.disconnect()
    return
  }
  if (previewContainerRef.value === el) return
  previewContainerRef.value = el
  previewResizeObserver?.disconnect()
  previewResizeObserver?.observe(el)
  updatePreviewZoom(el.clientWidth)
}

onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return

  previewResizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      updatePreviewZoom(entry.contentRect.width)
    }
  })

  if (previewContainerRef.value) {
    previewResizeObserver.observe(previewContainerRef.value)
  }
})

onBeforeUnmount(() => {
  previewResizeObserver?.disconnect()
  previewResizeObserver = null
})

// ==================== Хелпер: блок из ресурса API ====================

function toBlockItem(block: BlockResource, type: BlockType): BlockItem {
  return {
    id: block.id,
    code: block.code ?? type.code,
    title: block.title ?? '',
    description: block.description ?? '',
    icon: iconOfSettings(block.settings) || iconOf(type),
    settings: block.settings ?? null,
    parent_block_index_ids: block.parent_block_index_ids ?? [],
    published: block.published ?? false,
    is_test: block.is_test ?? false,
    is_proc: block.is_proc ?? false,
  }
}

async function fetchBlockItem(id: number, type: BlockType): Promise<BlockItem> {
  const res = await api.get<{ data: BlockResource } | BlockResource>(`/blocks/${id}`)
  const block = (res as { data?: BlockResource }).data ?? (res as BlockResource)
  return toBlockItem(block, type)
}

// ==================== Создание блока ====================
async function createBlockFromType(type: BlockType): Promise<BlockItem> {
  const res = await api.get<BlockResource | { data: BlockResource }>(
    `/block/template/${type.code}`,
  )

  const template = (res as { data?: BlockResource }).data ?? (res as BlockResource)

  const raw = template?.settings as any
  const settings: SettingNode | null =
    raw && typeof raw === 'object' && 'key' in raw ? structuredClone(raw) : null

  return {
    id: 0,
    code: type.code,
    title: template?.title ?? template?.name ?? type.name,
    description: template?.description ?? type.description ?? '',
    icon: iconOfSettings(settings) || iconOf(type),
    settings,
    parent_block_index_ids: [],
    published: false,
    is_test: template?.is_test ?? false,
    is_proc: template?.is_proc ?? false,
  }
}

async function addBlock(type: BlockType) {
  try {
    editingBlock.value = await createBlockFromType(type)

    router.replace({
      query: { addBlock: type.code },
    })
  } catch (e) {
    console.error('[addBlock] failed', e)
  }
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
  async ([code, types]) => {
    if (!code || typeof code !== 'string') return
    if (!types) return
    if (editingBlock.value?.code === code) return

    const type = types.find((t) => t.code === code)
    if (!type) return

    editingBlock.value = await createBlockFromType(type)
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

    if (editingBlock.value?.id === numId || previewBlock.value?.id === numId) return

    try {
      const res = await api.get<{ data: BlockResource } | BlockResource>(`/blocks/${numId}`)
      const block = (res as { data?: BlockResource }).data ?? (res as BlockResource)

      const type = types.find((t) => t.code === block.code)
      if (!type) {
        console.warn('[load block] block type not found:', block.code)
        return
      }

      // ?id — это просмотр (превью) блока в правой панели
      editingBlock.value = null
      previewBlock.value = toBlockItem(block, type)
    } catch (e) {
      console.error('[load block by id] failed', e)
    }
  },
  { immediate: true },
)

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

function resetState() {
  editingBlock.value = null
  previewBlock.value = null
}

function openTypeList(code: string) {
  resetState()
  router.replace({
    query: { type: code, page: '1' },
  })
}

function showAllBlocks() {
  resetState()
  router.replace({
    query: { page: '1' },
  })
}

async function findBlockItem(id: number): Promise<BlockItem | null> {
  const local = blocksPage.value?.data.find((b) => b.id === id)
  const code = local?.code ?? previewBlock.value?.code ?? editingBlock.value?.code
  const type = blockTypes.value?.find((t) => t.code === code)
  if (!type) {
    console.warn('[openBlock] block type not found:', code)
    return null
  }

  return fetchBlockItem(id, type)
}

// Одиночный клик — превью блока (подсветка карточки)
function preview(item: BlockResource) {
  router.replace({
    query: { id: String(item.id) },
  })

  const type = blockTypes.value?.find((t) => t.code === item.code)
  if (!type) {
    console.warn('[preview] block type not found:', item.code)
    return
  }

  editingBlock.value = null
  previewBlock.value = toBlockItem(item, type)
}

// Двойной клик — переход в редактирование
async function openBlock(id: number) {
  router.replace({
    query: { id: String(id) },
  })

  if (editingBlock.value?.id === id) return

  try {
    const block = await findBlockItem(id)
    if (!block) return
    editingBlock.value = block
    previewBlock.value = null
  } catch (e) {
    console.error('[openBlock] failed', e)
  }
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

    const payload: Record<string, any> = {
      code:          block.code,
      title:         block.title,
      description:   block.description,
      settings:      block.settings,
      parent_block_index_ids: block.parent_block_index_ids ?? [],
      published:     block.published,
      is_test:       block.is_test,
      is_proc:       block.is_proc,
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
      settings:    saved.settings ?? null,
      is_test:     saved.is_test ?? block.is_test,
      is_proc:     saved.is_proc ?? block.is_proc,
    }

    router.replace({
      query: { id: String(saved.id) },
    })

    blockKey.value++
  } finally {
    saving.value = false
  }
}

// ==================== Динамический резолв компонентов блоков ====================

const blockComponents = import.meta.glob(
  '~/components/Constructor/Components/*.vue',
  { eager: true },
)

const blockComponentMap: Record<string, any> = Object.fromEntries(
  Object.entries(blockComponents).map(([path, mod]) => {
    const name = path.split('/').pop()?.replace(/\.vue$/, '').toLowerCase() ?? ''
    return [name, (mod as any).default]
  }),
)

function resolveBlockComponent(code: string | null | undefined): any | null {
  if (!code) return null
  return blockComponentMap[code.toLowerCase().trim()] ?? null
}
</script>

<template>
  <ConstructPanels
    left-title="Типы блоков"
    :main-title="centerTitle"
    right-title="Свойства"
    :show-viewport-picker="!!editingBlock"
  >
    <template #left>
      <div class="flex flex-col gap-1.5 p-3">
        <div
          class="flex items-center gap-1.5 p-1 rounded-md border border-default bg-elevated text-[13px] text-default transition-colors hover:border-primary hover:bg-default"
          :class="{ 'border-primary bg-default shadow-[inset_0_0_0_2px_var(--ui-primary,#3b82f6)]': !listTypeCode && !editingBlock }"
        >
          <button
            type="button"
            class="flex-1 min-w-0 inline-flex items-center gap-2.5 px-2 py-1.5 border-none bg-transparent text-left text-[13px] text-inherit cursor-pointer rounded-[5px] transition-colors hover:bg-primary/10 active:bg-primary/20"
            @click.stop="showAllBlocks"
          >
            <UIcon name="i-lucide-list" class="w-4 h-4 shrink-0" />
            <span class="truncate">Все блоки</span>
          </button>
        </div>

        <div v-if="pending" class="p-8 text-center text-[13px] text-muted">Загрузка…</div>
        <div v-else-if="error" class="p-8 text-center text-[13px] text-muted">
          Не удалось загрузить типы блоков
        </div>

        <template v-else>
          <div
            v-for="type in blockTypes ?? []"
            :key="type.code"
            class="flex items-center gap-1.5 p-1 rounded-md border border-default bg-elevated text-[13px] text-default transition-colors hover:border-primary hover:bg-default"
            :class="{ 'border-primary bg-default shadow-[inset_0_0_0_2px_var(--ui-primary,#3b82f6)]': listTypeCode === type.code && !editingBlock }"
            :title="type.description ?? type.name"
          >
            <button
              type="button"
              class="shrink-0 inline-flex items-center justify-center size-[26px] rounded-[5px] border border-default bg-default text-default cursor-pointer transition-colors hover:border-primary hover:bg-primary hover:text-white active:translate-y-px"
              :aria-label="`Добавить блок «${type.name}»`"
              @click.stop="addBlock(type)"
            >
              <UIcon name="i-lucide-plus" class="w-4 h-4 shrink-0" />
            </button>

            <button
              type="button"
              class="flex-1 min-w-0 inline-flex items-center gap-2.5 px-2 py-1.5 border-none bg-transparent text-left text-[13px] text-inherit cursor-pointer rounded-[5px] transition-colors hover:bg-primary/10 active:bg-primary/20"
              @click.stop="openTypeList(type.code)"
            >
              <UIcon :name="iconOf(type)" class="w-4 h-4 shrink-0" />
              <span class="truncate">{{ type.name }}</span>
            </button>
          </div>
        </template>
      </div>
    </template>

    <template #main-header>
      <div class="flex items-center gap-2 min-w-0">
        <span>{{ centerTitle }}</span>
      </div>
    </template>

    <template #main>
      <template v-if="editingBlock">
        <LoadingOverlay :loading="saving">
          <component
            v-if="resolveBlockComponent(editingBlock.code)"
            :is="resolveBlockComponent(editingBlock.code)"
            :key="`${editingBlock.id}-${editingBlock.code}-${blockKey}`"
            :mode="'body'"
            :is-test="editingBlock.is_test"
            v-model="editingBlock.settings"
            :id="editingBlock.id || 0"
            :show-to-delete-images="true"
          />
          <div v-else class="p-8 text-center text-[13px] text-muted">
            Компонент «{{ editingBlock.code }}» не найден
          </div>
        </LoadingOverlay>
      </template>

      <template v-else>
        <div v-if="listLoading" class="p-8 text-center text-[13px] text-muted">Загрузка…</div>

        <div v-else-if="listError" class="p-8 text-center text-[13px] text-muted">
          {{ listError }}
        </div>

        <div
          v-else-if="!blocksPage || blocksPage.data.length === 0"
          class="p-8 text-center text-[13px] text-muted"
        >
          {{ listTypeCode ? 'Блоков этого типа пока нет' : 'Блоков пока нет' }}
        </div>

        <template v-else>
          <div class="flex flex-col gap-2 p-4 max-w-2xl mx-auto">
            <button
              v-for="item in blocksPage.data"
              :key="item.id"
              type="button"
              class="flex items-center gap-3 px-3.5 py-3 rounded-lg border border-default bg-default text-left cursor-pointer transition-colors hover:border-primary hover:shadow-sm"
              :class="{ 'border-primary bg-elevated': previewId === item.id }"
              @click="preview(item)"
              @dblclick="openBlock(item.id)"
            >
              <UIcon
                :name="iconOfSettings(item.settings)"
                class="size-16 shrink-0 text-muted"
              />

              <div class="flex-1 min-w-0 flex flex-col gap-1">
                <div class="text-sm font-medium text-highlighted truncate">
                  {{ item.title || item.name || `Блок №${item.id}` }}
                </div>
                <div v-if="item.description" class="text-xs text-muted truncate">
                  {{ item.description }}
                </div>
                <div class="flex items-center gap-2 mt-0.5">
                  <span v-if="item.code" class="inline-flex items-center px-2 py-px rounded-full bg-elevated text-[11px] font-medium text-muted">
                    {{ item.code }}
                  </span>
                  <span v-if="item.is_test" class="inline-flex items-center px-2 py-px rounded-full bg-warning/20 text-[11px] font-medium text-warning">
                    задание
                  </span>
                  <span v-if="item.is_proc" class="inline-flex items-center px-2 py-px rounded-full bg-primary/20 text-[11px] font-medium text-primary">
                    процедурное
                  </span>
                  <span class="font-mono text-[11px] text-muted/70">
                    #{{ item.id }}
                  </span>
                </div>
              </div>
              <UIcon name="i-lucide-chevron-right" class="shrink-0 text-muted" />
            </button>
          </div>

          <div v-if="blocksPage.meta.last_page > 1" class="flex items-center justify-center gap-3 px-3 pt-4 pb-6">
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

            <span class="text-xs text-muted min-w-[60px] text-center">
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

    <template #right-header>
      <span>{{ rightTitle }}</span>
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

    <template #right>
      <LoadingOverlay :loading="saving">
        <!-- Превью выбранного блока (одиночный клик по карточке) -->
        <div v-if="previewBlock" class="p-3">
          <div class="mb-3 px-1">
            <div class="text-sm font-medium text-highlighted truncate">
              {{ previewBlock.title || `Блок №${previewBlock.id}` }}
            </div>
            <div class="mt-1 flex items-center gap-2">
              <span v-if="previewBlock.code" class="inline-flex items-center px-2 py-px rounded-full bg-elevated text-[11px] font-medium text-muted">
                {{ previewBlock.code }}
              </span>
              <span class="font-mono text-[11px] text-muted/70">#{{ previewBlock.id }}</span>
            </div>
          </div>

          <div class="relative w-full" :ref="observePreviewContainer">
            <div
              class="pointer-events-none origin-top-left bg-default rounded-lg border border-default overflow-hidden"
              :style="{ zoom: previewZoom, width: `${PREVIEW_VIRTUAL_WIDTH}px` }"
            >
              <BlockRenderer
                :key="`preview-${previewBlock.id}`"
                :code="previewBlock.code"
                :id="previewBlock.id"
                :is-test="previewBlock.is_test"
                mode="body"
                :show-to-delete-images="false"
                :allow-drag-and-drop="false"
                :settings="previewBlock.settings as any"
              />
            </div>
          </div>
        </div>

        <div v-else-if="!editingBlock" class="p-8 text-center text-[13px] text-muted">
          Выберите блок в центре.
        </div>

        <BlocksSettingsPanel
          v-else
          mode="admin"
          v-model:id="editingBlock.id"
          v-model:title="editingBlock.title"
          v-model:description="editingBlock.description"
          v-model:is-test="editingBlock.is_test"
          v-model:is-proc="editingBlock.is_proc"
          v-model:settings="editingBlock.settings"
          v-model:parent_block_index_ids="editingBlock.parent_block_index_ids"
          v-model:published="editingBlock.published"
        />
      </LoadingOverlay>
    </template>
  </ConstructPanels>
</template>
