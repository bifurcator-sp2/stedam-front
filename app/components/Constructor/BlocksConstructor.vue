<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import BlocksSettingsPanel from '~/components/Constructor/BlocksSettingsPanel.vue'
import LoadingOverlay from '~/components/LoadingOverlay.vue'
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'

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
}

interface BlockResource {
  id: number
  code: string | null
  title: string | null
  description: string | null
  settings: SettingNode | null
  is_test?: boolean | null
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
const blockKey = ref(0)

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

    if (editingBlock.value?.id === numId) return

    try {
      const res = await api.get<{ data: BlockResource } | BlockResource>(`/blocks/${numId}`)
      const block = (res as { data?: BlockResource }).data ?? (res as BlockResource)

      const type = types.find((t) => t.code === block.code)
      if (!type) {
        console.warn('[load block] block type not found:', block.code)
        return
      }

      editingBlock.value = {
        ...block,
        id: block.id,
        code: block.code ?? type.code,
        title: block.title ?? '',
        description: block.description ?? '',
        icon: iconOfSettings(block.settings) || iconOf(type),
        settings: block.settings ?? null,
        parent_block_index_ids: block.parent_block_index_ids ?? [],
        published: block.published ?? false,
        is_test: block.is_test ?? false,
      }
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

    const payload: Record<string, any> = {
      code:          block.code,
      title:         block.title,
      description:   block.description,
      settings:      block.settings,
      parent_block_index_ids: block.parent_block_index_ids ?? [],
      published:     block.published,
      is_test:       block.is_test,
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
              @click="openBlock(item.id)"
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

    <template #right>
      <LoadingOverlay :loading="saving">
        <div v-if="!editingBlock" class="p-8 text-center text-[13px] text-muted">
          Выберите блок в центре.
        </div>

        <BlocksSettingsPanel
          v-else
          mode="admin"
          v-model:id="editingBlock.id"
          v-model:title="editingBlock.title"
          v-model:description="editingBlock.description"
          v-model:is-test="editingBlock.is_test"
          v-model:settings="editingBlock.settings"
          v-model:parent_block_index_ids="editingBlock.parent_block_index_ids"
          v-model:published="editingBlock.published"
        />
      </LoadingOverlay>
    </template>
  </ConstructPanels>
</template>
