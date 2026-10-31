<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import katex from 'katex'
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'
import Lesson from '~/components/Constructor/Lesson.vue'
import BlocksSettingsPanel from '~/components/Constructor/BlocksSettingsPanel.vue'
import LoadingOverlay from '~/components/LoadingOverlay.vue'
import LessonBlocksIndex from '~/components/Constructor/LessonBlocksIndex.vue'
import TestsSearch from '~/components/Education/TestsSearch.vue'
import { useAutosave } from '~/composables/useAutosave'
import type {
  LessonModel,
  LessonBlockModel,
  BlockStructItem,
  LessonSavePayload,
  LessonResponse,
  DraggedBlockSource,
} from '~/types/lesson'
import { createEmptyLesson } from '~/types/lesson'
import { toRaw } from 'vue'

// ==================== Зависимости ====================

const api = useApi()
const route = useRoute()
const router = useRouter()
const toast = useToast()

// Получаем текущего пользователя для проверки владельца задания
const { user } = useAuth()
const currentUserId = computed(() => user.value?.id)

const strictSaveMode = ref(false)

// ==================== Кастомный скроллбар для модалки ====================
const modalScrollClasses =
  "overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] " +
  "[scrollbar-width:thin] [scrollbar-color:transparent_transparent] " +
  "hover:[scrollbar-color:var(--ui-border,#e5e7eb)_transparent] " +
  "[&::-webkit-scrollbar]:w-1.5 " +
  "[&::-webkit-scrollbar-track]:bg-transparent " +
  "[&::-webkit-scrollbar-thumb]:bg-transparent " +
  "[&::-webkit-scrollbar-thumb]:rounded-full " +
  "hover:[&::-webkit-scrollbar-thumb]:bg-[var(--ui-border,#e5e7eb)] " +
  "[&::-webkit-scrollbar-thumb:hover]:bg-[var(--ui-text-muted,#9ca3af)]"

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

// ==================== Утилита: валидный ?tax из query ====================

function getValidTaxFromQuery(): number | null {
  const raw = route.query.tax
  const v = Array.isArray(raw) ? raw[0] : raw
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

// ==================== Модель урока ====================

const lesson = ref<LessonModel>(createEmptyLesson())
const lessonRef = ref<InstanceType<typeof Lesson> | null>(null)

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

async function togglePublished() {
  if (lesson.value.published) {
    lesson.value = { ...lesson.value, published: false }
    return
  }

  await nextTick()
  const container = lessonRef.value?.contentRef

  if (container) {
    let hasErrors = false

    if (container.querySelector('.katex-error')) {
      hasErrors = true
    }

    if (!hasErrors) {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
      let node: Node | null

      while ((node = walker.nextNode())) {
        const text = node.textContent || ''
        if (!text.includes('$')) continue

        const formulas = [
          ...Array.from(text.matchAll(/\$\$([\s\S]*?)\$\$/g)).map(m => ({ latex: m[1], display: true })),
          ...Array.from(text.matchAll(/\$([^\$\n]+?)\$/g)).map(m => ({ latex: m[1], display: false }))
        ]

        for (const { latex, display } of formulas) {
          try {
            katex.renderToString(latex.trim(), {
              displayMode: display,
              throwOnError: true,
              strict: false
            })
          } catch (e) {
            hasErrors = true
            break
          }
        }

        if (hasErrors) break

        const doubleDollarCount = (text.match(/\$\$/g) || []).length
        if (doubleDollarCount % 2 !== 0) {
          hasErrors = true
          break
        }

        const singleDollarText = text.replace(/\$\$/g, '')
        const singleDollarCount = (singleDollarText.match(/\$/g) || []).length
        if (singleDollarCount % 2 !== 0) {
          if (text.includes('\\') || /[\^\{\}\_=]/.test(singleDollarText) || /[a-zA-Z]\$|\$[a-zA-Z]/.test(singleDollarText)) {
            hasErrors = true
            break
          }
        }
      }
    }

    if (hasErrors) {
      toast.add({
        title: 'Ошибка синтаксиса формул',
        description: 'В уроке есть поломанные или нераспознанные формулы. Исправьте их перед публикацией.',
        color: 'error',
        icon: 'i-lucide-triangle-alert',
        timeout: 5000,
      })
      return
    }
  }

  lesson.value = { ...lesson.value, published: true }
}

// ==================== Модалка предупреждения о задании ====================

const isTestWarningOpen = ref(false)
const rememberTestChoice = ref(false)
const pendingTestBlock = ref<{ index: number, source: DraggedBlockSource } | null>(null)

function handleTestWarning(payload: { index: number, source: DraggedBlockSource }) {
  pendingTestBlock.value = payload
  isTestWarningOpen.value = true
}

function confirmTestWarning() {
  if (rememberTestChoice.value && import.meta.client) {
    localStorage.setItem('lesson_test_warning_accepted', 'true')
  }

  if (pendingTestBlock.value && lessonRef.value) {
    lessonRef.value.handleDropAtIndex(pendingTestBlock.value.index, pendingTestBlock.value.source, true)
  }

  isTestWarningOpen.value = false
  pendingTestBlock.value = null
}

// ==================== Модалка выбора задания из коллекции ====================

const isTaskCollectionOpen = ref(false)
const pendingTestIndex = ref<number | null>(null) // <--- Храним индекс для вставки

const modalTaxId = computed(() => {
  return lesson.value.taxonomy_ids?.[0] || null
})

// Принимаем индекс из Lesson.vue
function handleOpenTaskCollection(index: number) {
  pendingTestIndex.value = index
  isTaskCollectionOpen.value = true
}

function onSelectTestFromCollection(test: any) {
  // ПРОВЕРКА: запрещаем дублирование экземпляров из модалки
  const alreadyExists = lesson.value.blocks.some(
    b => b.isTest && b.id === test.id
  )

  if (alreadyExists) {
    toast.add({
      title: 'Задание уже добавлено',
      description: 'Этот экземпляр задания уже есть в вашем уроке.',
      color: 'warning',
      icon: 'i-lucide-alert-circle',
    })
    return
  }

  isTaskCollectionOpen.value = false

  const newBlock: LessonBlockModel = {
    localId: crypto.randomUUID(),
    id: test.id,
    blockId: null,
    blockTypeCode: test.block_type_code,
    settings: deepClone(test.settings),
    images: [],
    files: [],
    isTest: true,
    userId: test.user_id,
  }

  const next = lesson.value.blocks.slice()

  // Вставляем строго туда, куда перетащили, либо в конец (если индекса нет)
  const insertIndex = pendingTestIndex.value !== null ? pendingTestIndex.value : next.length
  const safeIndex = Math.max(0, Math.min(insertIndex, next.length))

  next.splice(safeIndex, 0, newBlock)
  lesson.value = { ...lesson.value, blocks: next }
  pendingTestIndex.value = null

  toast.add({
    title: 'Успешно',
    description: 'Задание добавлено в урок',
    color: 'success',
    icon: 'i-lucide-check-circle',
  })
}

// ==================== Утилиты клонирования ====================

function deepClone<T>(v: T): T {
  if (v === null || v === undefined) return v
  return JSON.parse(JSON.stringify(toRaw(v))) as T
}

// ==================== Snapshot для автосохранения ====================

function snapshotLesson(): string {
  return JSON.stringify({
    title: lesson.value.title,
    description: lesson.value.description,
    locale: lesson.value.locale,
    published: lesson.value.published,
    taxonomy_ids: lesson.value.taxonomy_ids,
    blocks: lesson.value.blocks.map((b) => ({
      id: b.id,
      localId: b.localId,
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
        isTest: b.is_test ?? false,
        userId: b.user_id ?? null,
      } as LessonBlockModel
    })

    const taxFromQuery = getValidTaxFromQuery()
    const hasSavedTaxonomies = Array.isArray(data.taxonomy_ids) && data.taxonomy_ids.length > 0
    const taxonomyIds: number[] = hasSavedTaxonomies
      ? data.taxonomy_ids
      : (taxFromQuery !== null ? [taxFromQuery] : [])

    isProgrammatic.value = true
    lesson.value = {
      id: data.id,
      title: data.title ?? '',
      description: data.description ?? '',
      locale: data.locale ?? 'ru',
      saved: data.saved ?? false,
      published: data.published ?? false,
      taxonomy_ids: taxonomyIds,
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

    const tax = getValidTaxFromQuery()
    const query: Record<string, string> = { id: String(data.id) }
    if (tax !== null) query.tax = String(tax)

    await router.replace({ query })
  } catch (e) {
    console.error('[createAndRedirect] failed', e)
    loadError.value = 'Не удалось создать урок'
  } finally {
    creating.value = false
  }
}

// ==================== Сохранение ====================

const saving = ref(false)

const isInitialLoading = computed(() => loading.value || creating.value)

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
    const prevActiveId = activeBlock.value?.id ?? null

    const payload: LessonSavePayload = {
      title: lesson.value.title,
      description: lesson.value.description,
      locale: lesson.value.locale,
      saved: true,
      published: lesson.value.published,
      taxonomy_ids: deepClone(lesson.value.taxonomy_ids ?? []),
      blocks: lesson.value.blocks.map((block) => ({
        id: block.id,
        settings: deepClone(block.settings),
        images: [],
        files: [],
      })),
    }

    const res = await api.put<{ data: LessonResponse } | LessonResponse>(
      `/lessons/${lesson.value.id}`,
      payload,
    )

    const data = (res as any).data ?? res

    if (strictSaveMode.value) {
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
            isTest: b.is_test ?? false,
            userId: b.user_id ?? null,
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
    } else {
      // --- БЫСТРЫЙ РЕЖИМ (по умолчанию) ---
      isProgrammatic.value = true
      lesson.value.saved = data.saved ?? true
      lesson.value.published = data.published ?? lesson.value.published
      lesson.value.taxonomy_ids = data.taxonomy_ids ?? lesson.value.taxonomy_ids
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
  watchSource: () => snapshotLesson(),
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
      <LoadingOverlay :loading="isInitialLoading">
        <Lesson
          ref="lessonRef"
          v-model="lesson"
          v-model:active-block-local-id="activeBlockLocalId"
          :struct-items="structItems"
          :is-read-only="isReadOnly"
          @test-warning="handleTestWarning"
          @open-task-collection="handleOpenTaskCollection"
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
              :model-value="lesson.published"
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
      <LoadingOverlay :loading="isInitialLoading">
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

          <!-- Упрощенная блокировка для заданий -->
          <div
            v-else-if="activeBlock.isTest"
            class="block-settings-panel flex h-full flex-col items-center justify-center p-6 text-center"
          >
            <div class="mb-3 flex size-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
              <UIcon name="i-lucide-lock" class="size-6" />
            </div>
            <p class="text-sm font-medium text-(--ui-text-highlighted) mb-2">Редактирование заблокировано</p>
            <p class="text-xs text-(--ui-text-muted) leading-snug max-w-[240px]">
              Редактировать задания можно только в разделе <NuxtLink @pointerdown.stop to="/teacher-tests" class="text-primary hover:underline font-semibold">Задания</NuxtLink>
            </p>
          </div>

          <!-- Обычные настройки -->
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

  <!-- 1. Модалка предупреждения о создании задания -->
  <UModal
    v-model:open="isTestWarningOpen"
    title="Информация!"
    :ui="{ body: 'p-6', content: 'sm:max-w-md' }"
    :close="false"
    :dismissible="false"
  >
    <template #body>
      <div class="flex items-center gap-3 mb-4">
        <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/10">
          <UIcon name="i-lucide-triangle-alert" class="size-5 text-warning" />
        </div>
        <h3 class="text-lg font-semibold text-highlighted">Добавление задания</h3>
      </div>

      <div class="text-sm text-muted space-y-3 mb-6">
        <p>Добавляя в урок шаблон задания вы создаете новое задание.</p>
        <p>Оно будет доступно другим пользователям в их уроках, но они не смогут его редактировать.</p>
        <p>Задание появится в базе данных, когда оно будет опубликовано хотя бы в одном уроке.</p>
      </div>

      <div class="flex items-center gap-2 mb-6">
        <UCheckbox
          v-model="rememberTestChoice"
          label="Запомнить мой выбор на этом устройстве"
        />
      </div>

      <div class="flex justify-end">
        <UButton color="primary" @click="confirmTestWarning">
          Я понял
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- 2. Модалка добавления задания из коллекции -->
  <UModal
    v-model:open="isTaskCollectionOpen"
    title="Добавление задания из коллекции"
    :ui="{
      content: 'sm:max-w-3xl w-full transition-all duration-300 ease-in-out',
      body: 'p-0 flex flex-col overflow-hidden'
    }"
  >
    <template #body>
      <!-- Оборачиваем в скроллируемый контейнер с ограничением по высоте и кастомным скроллом -->
      <div :class="['max-h-[75vh] min-w-[600px] min-h-[300px]', modalScrollClasses]">
        <TestsSearch
          :selected-taxonomy-id="modalTaxId"
          @select-test="onSelectTestFromCollection"
        />
      </div>
    </template>
  </UModal>
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
