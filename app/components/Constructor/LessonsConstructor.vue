<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'
import Lesson from '~/components/Constructor/Lesson.vue'
import BlocksSettingsPanel from '~/components/Constructor/BlocksSettingsPanel.vue'
import LoadingOverlay from '~/components/LoadingOverlay.vue'
import LessonBlocksIndex from '~/components/Constructor/LessonBlocksIndex.vue'
import { useAutosave } from '~/composables/useAutosave'
import type {
  LessonModel,
  LessonBlockModel,
  BlockStructItem,
  LessonSavePayload,
  LessonResponse,
} from '~/types/lesson'
import { createEmptyLesson } from '~/types/lesson'
import { toRaw } from 'vue'

// ==================== Зависимости ====================

const api = useApi()
const route = useRoute()
const router = useRouter()

// ==================== Структура типов ====================

const {
  data: struct,
  pending: structPending,
  error: structError,
} = await useAsyncData('block-types-struct', () =>
  api.get<{ data: BlockStructItem[] }>('/block-types/struct'),
)

const structItems = computed<BlockStructItem[]>(() => struct.value?.data ?? [])

// ==================== Утилита: поиск настроек блока в дереве ====================

function findBlockSettingsInTree(nodes: BlockStructItem[], blockId: number | null): any {
  if (!blockId) return null
  for (const node of nodes) {
    const found = node.blocks?.find(b => b.id === blockId)
    if (found) return found.default_settings ?? null
    if (node.children?.length) {
      const inChildren = findBlockSettingsInTree(node.children, blockId)
      if (inChildren) return inChildren
    }
  }
  return null
}

// ==================== Модель урока ====================

const lesson = ref<LessonModel>(createEmptyLesson())

// ==================== Активный блок ====================

const activeBlockLocalId = ref<string | null>(null)

const activeBlock = computed<LessonBlockModel | null>(() => {
  if (!activeBlockLocalId.value) return null
  return lesson.value.blocks.find((b) => b.localId === activeBlockLocalId.value) ?? null
})

// ==================== Заголовок ====================

const centerTitle = computed(() => {
  if (lesson.value.id && lesson.value.id > 0) {
    return `Урок №${lesson.value.id}`
  }
  return 'Новый урок'
})

// ==================== Статус публикации ====================

const isReadOnly = computed(() => lesson.value.published)

function togglePublished() {
  lesson.value = { ...lesson.value, published: !lesson.value.published }
}

// ==================== Утилиты diff / patch ====================

function unwrapProxy(v: any): any {
  if (v === null || typeof v !== 'object') return v
  v = toRaw(v)
  if (Array.isArray(v)) {
    return v.map(unwrapProxy)
  }
  const out: any = {}
  for (const k in v) {
    if (Object.prototype.hasOwnProperty.call(v, k)) {
      out[k] = unwrapProxy(v[k])
    }
  }
  return out
}

function deepClone<T>(v: T): T {
  return structuredClone(unwrapProxy(v)) as T
}

// ==================== Snapshot + retry для автосохранения ====================

function snapshotLesson(): string {
  return JSON.stringify({
    title: lesson.value.title,
    description: lesson.value.description,
    locale: lesson.value.locale,
    published: lesson.value.published,
    blocks: lesson.value.blocks.map((b) => ({
      id: b.id,
      settings: b.settings,
    })),
  })
}

let lastSavedSnapshot = ''
let retrySaveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleRetrySave(delayMs = 5000) {
  if (retrySaveTimer) clearTimeout(retrySaveTimer)
  retrySaveTimer = setTimeout(async () => {
    retrySaveTimer = null
    if (busy.value) return
    if (!lesson.value.id) return
    if (snapshotLesson() === lastSavedSnapshot) return
    await save()
  }, delayMs)
}

// ==================== Загрузка урока ====================

const loading = ref(false)
const creating = ref(false)
const loadError = ref<string | null>(null)
const isProgrammatic = ref(false)

async function loadLesson(id: number) {
  loading.value = true
  loadError.value = null

  try {
    const res = await api.get<{ data: LessonResponse } | LessonResponse>(`/lessons/${id}`)
    const data = (res as any).data ?? res

    const blocks: LessonBlockModel[] = (data.blocks ?? []).map((b: any) => {
      const fallback = findBlockSettingsInTree(structItems.value, b.block_id)
      const rawSettings = b.settings
      const settings = (rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings) && 'key' in rawSettings)
        ? deepClone(rawSettings)
        : deepClone(fallback)

      return {
        localId: crypto.randomUUID(),
        id: b.id,
        blockId: b.block_id ?? null,
        blockTypeCode: b.block_type_code ?? '',
        settings,
      } as LessonBlockModel
    })

    isProgrammatic.value = true
    lesson.value = {
      id: data.id,
      title: data.title ?? '',
      description: data.description ?? '',
      locale: data.locale ?? 'ru',
      saved: data.saved ?? false,
      published: data.published ?? false,
      taxonomy_ids: data.taxonomy_ids ?? [],
      blocks,
    }

    lastSavedSnapshot = snapshotLesson()
  } catch (e) {
    console.error('[loadLesson] failed', e)
    loadError.value = 'Не удалось загрузить урок'
  } finally {
    loading.value = false
    await nextTick()
    isProgrammatic.value = false
  }
}

async function createAndRedirect() {
  if (creating.value) return
  creating.value = true

  try {
    const res = await api.post<{ data: LessonResponse } | LessonResponse>('/lessons/make')
    const data = (res as any).data ?? res

    await router.replace({ query: { id: String(data.id) } })
  } catch (e) {
    console.error('[createAndRedirect] failed', e)
    loadError.value = 'Не удалось создать урок'
  } finally {
    creating.value = false
  }
}

// ==================== Сохранение ====================

const saving = ref(false)

const busy = computed(() =>
  loading.value || creating.value || saving.value,
)

async function save() {
  if (!lesson.value.id) return
  if (saving.value) return

  if (retrySaveTimer) {
    clearTimeout(retrySaveTimer)
    retrySaveTimer = null
  }

  saving.value = true
  try {
    const snapshotAtSave = snapshotLesson()

    const payload: LessonSavePayload = {
      title: lesson.value.title,
      description: lesson.value.description,
      locale: lesson.value.locale,
      saved: true,
      published: lesson.value.published,
      taxonomy_ids: lesson.value.taxonomy_ids ?? [],
      blocks: lesson.value.blocks.map((block) => ({
        id: block.id,
        settings: deepClone(block.settings),
        images: [],
        files: [],
      })),
    }

    const prevActiveId = activeBlock.value?.id ?? null

    const res = await api.put<{ data: LessonResponse } | LessonResponse>(
      `/lessons/${lesson.value.id}`,
      payload,
    )

    const data = (res as any).data ?? res

    const userEditedDuringSave = snapshotLesson() !== snapshotAtSave

    if (userEditedDuringSave) {
      lesson.value = {
        ...lesson.value,
        saved: data.saved ?? true,
        taxonomy_ids: data.taxonomy_ids ?? [],
        published: data.published ?? lesson.value.published,
      }

      scheduleRetrySave()
    } else {
      const updatedBlocks: LessonBlockModel[] = (data.blocks ?? []).map((b: any) => {
        const fallback = findBlockSettingsInTree(structItems.value, b.block_id)
        const rawSettings = b.settings
        const settings = (rawSettings && typeof rawSettings === 'object' && !Array.isArray(rawSettings) && 'key' in rawSettings)
          ? deepClone(rawSettings)
          : deepClone(fallback)

        return {
          localId: crypto.randomUUID(),
          id: b.id,
          blockId: b.block_id ?? null,
          blockTypeCode: b.block_type_code ?? '',
          settings,
        } as LessonBlockModel
      })

      isProgrammatic.value = true
      lesson.value = {
        ...lesson.value,
        saved: data.saved ?? true,
        published: data.published ?? lesson.value.published,
        blocks: updatedBlocks,
      }

      activeBlockLocalId.value =
        updatedBlocks.find((b) => b.id === prevActiveId)?.localId ?? null

      lastSavedSnapshot = snapshotLesson()
    }
  } catch (e) {
    console.error('[save] failed', e)
  } finally {
    saving.value = false
    await nextTick()
    isProgrammatic.value = false
  }
}

// ==================== Автосохранение ====================

const { remaining: autosaveRemaining, cancel: cancelAutosave } = useAutosave({
  delaySec: 5,
  canRun: () =>
    !!lesson.value.id
    && lesson.value.blocks.length > 0
    && !busy.value
    && !isReadOnly.value,
  save,
  watchSource: () => lesson.value,
  isProgrammatic: () => isProgrammatic.value,
  extraPopupSelectors: ['.crop-modal-backdrop'],
})

watch(saving, (val) => {
  if (val) cancelAutosave()
})

// ==================== Watch: ?id ====================

watch(
  () => route.query.id,
  async (id) => {
    if (structItems.value.length === 0) return

    if (!id || typeof id !== 'string') {
      await createAndRedirect()
      return
    }

    const numId = Number(id)
    if (!Number.isFinite(numId)) {
      await createAndRedirect()
      return
    }

    if (lesson.value.id === numId) return
    await loadLesson(numId)
  },
  { immediate: true },
)

watch(
  structItems,
  async (items) => {
    if (items.length === 0) return

    const id = route.query.id
    if (!id || typeof id !== 'string') {
      await createAndRedirect()
      return
    }

    const numId = Number(id)
    if (!Number.isFinite(numId)) {
      await createAndRedirect()
      return
    }
    if (lesson.value.id === numId) return

    await loadLesson(numId)
  },
)

// ==================== Модели для right panel ====================

const activeBlockIdModel = computed(() => activeBlock.value?.id ?? null)

const activeBlockSettingsModel = computed({
  get: () => activeBlock.value?.settings ?? null,
  set: (v) => {
    if (activeBlock.value) {
      activeBlock.value.settings = v
    }
  },
})

// ==================== Lifecycle ====================

onBeforeUnmount(() => {
  if (retrySaveTimer) {
    clearTimeout(retrySaveTimer)
    retrySaveTimer = null
  }
})
</script>

<template>
  <ConstructPanels
    left-title="Блоки"
    :main-title="centerTitle"
    right-title="Свойства"
    :show-viewport-picker="true"
  >
    <template #left>
      <LessonBlocksIndex
        :struct-items="structItems"
        :pending="structPending"
        :error="structError"
      />
    </template>

    <template #main-header>
      <div class="flex min-w-0 items-center gap-2">
        <span>{{ centerTitle }}</span>
      </div>
    </template>

    <template #main>
      <LoadingOverlay :loading="busy">
        <Lesson
          v-model="lesson"
          v-model:active-block-local-id="activeBlockLocalId"
          :struct-items="structItems"
          :is-read-only="isReadOnly"
        />
      </LoadingOverlay>
    </template>

    <template #right-header>
      <div class="flex w-full items-center justify-between gap-2">
        <span>Свойства</span>

        <div class="flex items-center gap-3">
          <Transition name="autosave-fade">
            <span
              v-if="autosaveRemaining !== null && !isReadOnly"
              class="inline-flex items-center gap-[5px] rounded-full border border-(--ui-border) bg-(--ui-bg-elevated) px-2 py-[3px] text-[11px] font-semibold tabular-nums text-(--ui-text-muted)"
              :title="`Автосохранение произойдет через ${autosaveRemaining} с`"
            >
              <UIcon name="i-lucide-save" class="h-3 w-3 text-(--ui-primary)" />
              <span class="min-w-[10px] text-center">
                {{ autosaveRemaining }}
              </span>
            </span>
          </Transition>

          <div
            class="flex items-center gap-2 cursor-pointer select-none"
            @click="togglePublished"
          >
            <USwitch
              v-model="lesson.published"
              color="success"
              size="xs"
            />
            <span
              class="text-[10px] font-bold uppercase tracking-widest transition-colors"
              :class="lesson.published ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'"
            >
              {{ lesson.published ? 'Опубликован' : 'Черновик' }}
            </span>
          </div>

          <UButton
            icon="i-lucide-save"
            size="xs"
            color="primary"
            variant="soft"
            :loading="saving"
            :disabled="busy || lesson.blocks.length === 0"
            @click="save"
          >
            Сохранить
          </UButton>
        </div>
      </div>
    </template>

    <template #right>
      <LoadingOverlay :loading="busy">
        <div
          v-if="isReadOnly"
          class="flex h-full flex-col items-center justify-center p-6 text-center text-(--ui-text-muted)"
        >
          <div class="mb-3 flex size-12 items-center justify-center rounded-full bg-warning/10">
            <UIcon name="i-lucide-lock" class="size-6 text-warning" />
          </div>
          <p class="text-sm font-medium text-(--ui-text-highlighted)">Урок опубликован</p>
          <p class="mt-1 max-w-[200px] text-xs leading-snug">
            Снимите урок с публикации с помощью переключателя сверху, чтобы вносить изменения.
          </p>
        </div>

        <template v-else>
          <div v-if="!activeBlock" class="px-4 py-8 text-center text-[13px] text-(--ui-text-muted)">
            Выберите блок в центре.
          </div>

          <BlocksSettingsPanel
            v-else
            model-name="lesson_blocks"
            mode="public"
            :id="activeBlockIdModel"
            v-model:settings="activeBlockSettingsModel"
          />
        </template>
      </LoadingOverlay>
    </template>
  </ConstructPanels>
</template>

<style scoped>
.autosave-fade-enter-active,
.autosave-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.autosave-fade-enter-from,
.autosave-fade-leave-to {
  opacity: 0;
  transform: translateX(4px);
}
</style>
