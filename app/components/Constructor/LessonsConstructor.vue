<script setup lang="ts">
// app/components/Constructor/LessonsConstructor.vue

import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'
import Lesson from '~/components/Constructor/Lesson.vue'
import BlocksSettingsPanel from '~/components/Constructor/BlocksSettingsPanel.vue'
import LoadingOverlay from '~/components/LoadingOverlay.vue'
import FileContainer from '~/components/FileContainer.vue'
import { mergeFlat, unmergeFlat, isPlainObject } from '~/utils/constructors'
import { useAutosave } from '~/composables/useAutosave'
import type {
  LessonModel,
  LessonBlockModel,
  BlockStructItem,
  DraggedBlockSource,
  LessonSavePayload,
  LessonResponse,
} from '~/types/lesson'
import { createEmptyLesson } from '~/types/lesson'

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

// ==================== Модель урока ====================

const lesson = ref<LessonModel>(createEmptyLesson())

// ==================== Активный блок ====================

const activeBlockLocalId = ref<string | null>(null)

const activeBlock = computed<LessonBlockModel | null>(() => {
  if (!activeBlockLocalId.value) return null
  return lesson.value.blocks.find((b) => b.localId === activeBlockLocalId.value) ?? null
})

// ==================== FileContainer-ы ====================

const fileContainers = ref<Record<string, InstanceType<typeof FileContainer> | null>>({})

function onRegisterFiles(blockLocalId: string, inst: any) {
  if (inst) {
    fileContainers.value[blockLocalId] = inst
  } else {
    delete fileContainers.value[blockLocalId]
  }
}

// ==================== Заголовок ====================

const centerTitle = computed(() => {
  if (lesson.value.id && lesson.value.id > 0) {
    return `Урок №${lesson.value.id}`
  }
  return 'Новый урок'
})

// ==================== Аккордеон ====================

const openTypeId = ref<number | null>(null)

function toggleType(id: number) {
  openTypeId.value = openTypeId.value === id ? null : id
}

// ==================== Хелперы ====================

function iconOf(type: Pick<BlockStructItem, 'default_settings'>): string {
  const fields = Array.isArray(type.default_settings) ? type.default_settings : []
  const iconField = fields.find((f: any) => f.key === 'icon')
  return (iconField?.default as string | undefined) ?? 'i-lucide-square'
}

function iconOfBlock(block: { settings?: Record<string, any> | null }): string {
  if (isPlainObject(block.settings) && block.settings.icon) {
    return block.settings.icon
  }
  return 'i-lucide-file-text'
}

// ==================== Тултип ====================

interface TooltipState {
  visible: boolean
  text: string
  x: number
  y: number
}

const tooltip = ref<TooltipState>({
  visible: false,
  text: '',
  x: 0,
  y: 0,
})

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

// ==================== Автоскролл ====================

const scrollingNameId = ref<number | null>(null)
const nameShift = ref(0)

function onNameEnter(typeId: number, e: MouseEvent) {
  const target = e.currentTarget as HTMLElement | null
  if (!target) return
  const inner = target.querySelector('.struct-name__inner') as HTMLElement | null
  if (!inner) return

  const containerWidth = target.clientWidth
  const textWidth = inner.scrollWidth

  if (textWidth <= containerWidth) {
    scrollingNameId.value = null
    return
  }

  nameShift.value = textWidth - containerWidth + 8
  scrollingNameId.value = typeId
}

function onNameLeave() {
  scrollingNameId.value = null
}

// ==================== Drag ====================

function onBlockDragStart(
  e: DragEvent,
  type: BlockStructItem,
  block: BlockStructItem['blocks'][0],
) {
  if (!e.dataTransfer) return
  if (block.id <= 0) {
    e.preventDefault()
    return
  }

  const source: DraggedBlockSource = { type, block }
  ;(window as any).__draggedBlockSource = source

  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData('text/plain', String(block.id))
}

function onBlockDragEnd() {
  ;(window as any).__draggedBlockSource = null
}

// ==================== Загрузка урока ====================

const loading = ref(false)
const creating = ref(false)
const loadError = ref<string | null>(null)

async function loadLesson(id: number) {
  loading.value = true
  loadError.value = null

  try {
    const res = await api.get<{ data: LessonResponse } | LessonResponse>(`/lessons/${id}`)
    const data = (res as any).data ?? res

    const blocks: LessonBlockModel[] = (data.blocks ?? []).map((b: any) => {
      const type = structItems.value.find((t) => t.code === b.block_type_code)
      const sourceBlock = type?.blocks.find((sb) => sb.id === b.block_id)

      const fullSettings = mergeFlat(
        type?.default_settings ?? [],
        sourceBlock?.settings ?? undefined,
        b.settings ?? undefined,
      )

      return {
        localId: crypto.randomUUID(),
        id: b.id,
        blockId: b.block_id ?? null,
        blockTypeCode: b.block_type_code ?? '',
        settings: fullSettings,
        images: b.images ?? [],
        files: b.files ?? [],
      }
    })

    isProgrammatic.value = true
    lesson.value = {
      id: data.id,
      title: data.title ?? '',
      description: data.description ?? '',
      locale: data.locale ?? 'ru',
      saved: data.saved ?? false,
      published: data.published ?? false,
      blocks,
    }
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
const isProgrammatic = ref(false)

const busy = computed(() =>
  loading.value || creating.value || saving.value
)

async function save() {
  if (!lesson.value.id) return

  saving.value = true
  try {
    // Синхронизируем images/files из FileContainer-ов в модель
    for (const block of lesson.value.blocks) {
      const container = fileContainers.value[block.localId]
      if (!container) continue

      const files = container.getFiles?.()
      if (!files) continue

      block.images = (files.images ?? []).filter((i: any) => !i.toDelete)
      block.files  = (files.files  ?? []).filter((f: any) => !f.toDelete)
    }

    const payload: LessonSavePayload = {
      title:       lesson.value.title,
      description: lesson.value.description,
      locale:      lesson.value.locale,
      saved:       true,
      published:   lesson.value.published,
      blocks: lesson.value.blocks.map((block) => {
        const type = structItems.value.find((t) => t.code === block.blockTypeCode)
        const sourceBlock = type?.blocks.find((sb) => sb.id === block.blockId)

        return {
          id: block.id,
          settings: unmergeFlat(
            block.settings,
            type?.default_settings ?? [],
            sourceBlock?.settings ?? undefined,
          ),
          images: block.images,
          files:  block.files,
        }
      }),
    }

    const res = await api.put<{ data: LessonResponse } | LessonResponse>(
      `/lessons/${lesson.value.id}`,
      payload,
    )

    const data = (res as any).data ?? res

    const updatedBlocks = lesson.value.blocks.map((block, idx) => {
      const savedBlock = data.blocks?.[idx]
      if (!savedBlock) return block

      const type = structItems.value.find((t) => t.code === savedBlock.block_type_code)
      const sourceBlock = type?.blocks.find((sb) => sb.id === savedBlock.block_id)

      // ВАЖНО: Разворачиваем обновленные настройки от сервера обратно в дерево
      const fullSettings = mergeFlat(
        type?.default_settings ?? [],
        sourceBlock?.settings ?? undefined,
        savedBlock.settings ?? undefined,
      )

      return {
        ...block,
        id: savedBlock.id,
        blockId: savedBlock.block_id,
        blockTypeCode: savedBlock.block_type_code,
        settings: fullSettings, // <-- Обновляем настройки ответом сервера
        images: savedBlock.images ?? block.images, // (на всякий случай)
        files:  savedBlock.files  ?? block.files,
      }
    })

    isProgrammatic.value = true
    lesson.value = {
      ...lesson.value,
      saved:     data.saved ?? true,
      published: data.published ?? lesson.value.published,
      blocks:    updatedBlocks,
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
    && !busy.value,
  save,
  watchSource: () => lesson.value,
  isProgrammatic: () => isProgrammatic.value,
  // Селектор лайтбокса кропа из FileContainer
  extraPopupSelectors: ['.crop-modal-backdrop'],
})

// Пока идёт сохранение — отменяем запланированное автосохранение
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

const activeBlockIdModel = computed({
  get: () => activeBlock.value?.id ?? null,
  set: (v) => {
    if (activeBlock.value) {
      activeBlock.value.id = v ?? 0
    }
  },
})

const activeBlockSettingsModel = computed({
  get: () => activeBlock.value?.settings ?? [],
  set: (v) => {
    if (activeBlock.value) {
      activeBlock.value.settings = v
    }
  },
})

// ==================== Lifecycle ====================

onMounted(() => {
  window.addEventListener('dragend', onBlockDragEnd)
})

onBeforeUnmount(() => {
  window.removeEventListener('dragend', onBlockDragEnd)
})
</script>

<template>
  <ConstructPanels
    left-title="Блоки"
    :main-title="centerTitle"
    right-title="Свойства"
    :show-viewport-picker="true"
  >
    <!-- ==================== LEFT ==================== -->
    <template #left>
      <LoadingOverlay :loading="busy">
        <div class="struct-panel">
          <div v-if="structPending" class="empty-state">Загрузка…</div>
          <div v-else-if="structError" class="empty-state">
            Не удалось загрузить структуру
          </div>
          <div v-else-if="structItems.length === 0" class="empty-state">
            Пока ничего нет
          </div>

          <template v-else>
            <div
              v-for="type in structItems"
              :key="type.id"
              class="struct-item"
              :class="{ 'struct-item--open': openTypeId === type.id }"
            >
              <button
                type="button"
                class="struct-head"
                @click="toggleType(type.id)"
                @mouseenter="showTooltip($event, type.description)"
                @mouseleave="hideTooltip"
              >
                <span
                  class="struct-chevron"
                  :class="{ 'struct-chevron--open': openTypeId === type.id }"
                >
                  <UIcon name="i-lucide-chevron-right" class="w-4 h-4" />
                </span>

                <UIcon :name="iconOf(type)" class="struct-icon" />

                <span
                  class="struct-name"
                  @mouseenter="onNameEnter(type.id, $event)"
                  @mouseleave="onNameLeave"
                >
                  <span
                    class="struct-name__inner"
                    :style="{
                      transform: scrollingNameId === type.id
                        ? `translateX(-${nameShift}px)`
                        : 'translateX(0)',
                    }"
                  >
                    {{ type.name }}
                  </span>
                </span>

                <span
                  class="struct-count"
                  :class="{ 'struct-count--empty': type.blocks_count === 0 }"
                >
                  {{ type.blocks_count }}
                </span>
              </button>

              <Transition name="struct-expand">
                <div v-if="openTypeId === type.id" class="struct-body">
                  <div v-if="type.blocks.length === 0" class="struct-empty">
                    Блоков этого типа пока нет
                  </div>

                  <template v-else>
                    <div
                      v-for="block in type.blocks"
                      :key="block.id"
                      class="struct-block"
                      draggable="true"
                      @dragstart="onBlockDragStart($event, type, block)"
                      @dragend="onBlockDragEnd"
                      @mouseenter="showTooltip($event, block.description)"
                      @mouseleave="hideTooltip"
                    >
                      <UIcon
                        :name="iconOfBlock(block)"
                        class="struct-block__icon"
                      />
                      <span class="struct-block__title">
                        {{ block.title || `Блок №${block.id}` }}
                      </span>
                      <span class="struct-block__id">#{{ block.id }}</span>
                    </div>
                  </template>
                </div>
              </Transition>
            </div>
          </template>
        </div>
      </LoadingOverlay>
    </template>

    <!-- ==================== MAIN HEADER ==================== -->
    <template #main-header>
      <div class="main-header-inner">
        <span>{{ centerTitle }}</span>
      </div>
    </template>

    <!-- ==================== MAIN ==================== -->
    <template #main>
      <LoadingOverlay :loading="busy">
        <Lesson
          v-model="lesson"
          v-model:active-block-local-id="activeBlockLocalId"
          :struct-items="structItems"
          @register-files="onRegisterFiles"
        />
      </LoadingOverlay>
    </template>

    <!-- ==================== RIGHT HEADER ==================== -->
    <template #right-header>
      <span>Свойства</span>

      <div class="right-actions">
        <Transition name="autosave-fade">
          <span
            v-if="autosaveRemaining !== null"
            class="autosave-chip"
            :title="`Автосохранение произойдет через ${autosaveRemaining} с`"
          >
            <UIcon name="i-lucide-save" class="autosave-chip__icon" />
            <span class="autosave-chip__text">
              {{ autosaveRemaining }}
            </span>
          </span>
        </Transition>

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
    </template>

    <!-- ==================== RIGHT ==================== -->
    <template #right>
      <LoadingOverlay :loading="busy">
        <div v-if="!activeBlock" class="empty-state">
          Выберите блок в центре.
        </div>

        <BlocksSettingsPanel
          v-else
          model-name="lesson_blocks"
          mode="public"
          v-model:id="activeBlockIdModel"
          v-model:settings="activeBlockSettingsModel"
        />
      </LoadingOverlay>
    </template>
  </ConstructPanels>

  <!-- ==================== Тултип ==================== -->
  <Teleport to="body">
    <Transition name="struct-tooltip-fade">
      <div
        v-if="tooltip.visible"
        class="struct-tooltip-floating"
        :style="{
          left: `${tooltip.x}px`,
          top: `${tooltip.y}px`,
        }"
      >
        {{ tooltip.text }}
        <span class="struct-tooltip-floating__arrow" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ==================== Хедер центра ==================== */

.main-header-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* ==================== Хедер правой панели ==================== */

.right-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.autosave-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--ui-bg-elevated, #f8fafc);
  border: 1px solid var(--ui-border, #e5e7eb);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted, #64748b);
}

.autosave-chip__icon {
  width: 12px;
  height: 12px;
  color: var(--ui-primary, #3b82f6);
}

.autosave-chip__text {
  min-width: 10px;
  text-align: center;
}

.autosave-fade-enter-active,
.autosave-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.autosave-fade-enter-from,
.autosave-fade-leave-to {
  opacity: 0;
  transform: translateX(4px);
}

/* ==================== Аккордеон ==================== */

.struct-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
}

.struct-item {
  border: 1px solid var(--ui-border, #e5e7eb);
  border-radius: 8px;
  background: var(--ui-bg, #ffffff);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.struct-item:hover {
  border-color: var(--ui-primary, #3b82f6);
}

.struct-item--open {
  border-color: var(--ui-primary, #3b82f6);
  box-shadow: 0 1px 3px rgba(59, 130, 246, 0.08);
}

.struct-head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 13px;
  color: var(--ui-text, #111827);
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s;
}

.struct-head:hover {
  background: var(--ui-bg-muted, rgba(59, 130, 246, 0.04));
}

.struct-item--open .struct-head {
  border-bottom: 1px solid var(--ui-border, #e5e7eb);
  border-radius: 8px 8px 0 0;
}

.struct-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ui-text-muted, #9ca3af);
  transition: transform 0.2s ease, color 0.15s;
}

.struct-chevron--open {
  transform: rotate(90deg);
  color: var(--ui-primary, #3b82f6);
}

.struct-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: var(--ui-text-muted, #6b7280);
}

.struct-item--open .struct-icon {
  color: var(--ui-primary, #3b82f6);
}

.struct-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  position: relative;
  font-weight: 500;
  white-space: nowrap;
}

.struct-name__inner {
  display: inline-block;
  white-space: nowrap;
  transition: transform 0.4s ease;
  will-change: transform;
}

.struct-count {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--ui-bg-muted, rgba(59, 130, 246, 0.1));
  color: var(--ui-primary, #3b82f6);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.struct-count--empty {
  background: var(--ui-bg-muted, rgba(107, 114, 128, 0.1));
  color: var(--ui-text-muted, #9ca3af);
}

.struct-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  background: var(--ui-bg-elevated, #f9fafb);
  border-radius: 0 0 8px 8px;
}

.struct-empty {
  padding: 10px 8px;
  text-align: center;
  font-size: 12px;
  color: var(--ui-text-muted, #9ca3af);
}

.struct-block {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 5px;
  background: transparent;
  text-align: left;
  font-size: 12px;
  color: var(--ui-text, #111827);
  cursor: grab;
  user-select: none;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}

.struct-block:hover {
  background: var(--ui-bg, #ffffff);
  color: var(--ui-primary, #3b82f6);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
}

.struct-block:active {
  cursor: grabbing;
}

.struct-block__icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: var(--ui-text-muted, #9ca3af);
}

.struct-block:hover .struct-block__icon {
  color: var(--ui-primary, #3b82f6);
}

.struct-block__title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.struct-block__id {
  flex-shrink: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  color: var(--ui-text-muted, #9ca3af);
}

.struct-expand-enter-active,
.struct-expand-leave-active {
  overflow: hidden;
  transition: max-height 0.25s ease, opacity 0.2s ease;
}

.struct-expand-enter-from,
.struct-expand-leave-to {
  max-height: 0;
  opacity: 0;
}

.struct-expand-enter-to,
.struct-expand-leave-from {
  max-height: 2000px;
  opacity: 1;
}

/* ==================== Тултип ==================== */

:global(.struct-tooltip-floating) {
  position: fixed;
  z-index: 9999;
  transform: translate(-50%, -100%);
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(17, 24, 39, 0.95);
  color: #ffffff;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.4;
  white-space: normal;
  max-width: 260px;
  min-width: 80px;
  text-align: center;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

:global(.struct-tooltip-floating__arrow) {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: rgba(17, 24, 39, 0.95);
}

:global(.struct-tooltip-fade-enter-active),
:global(.struct-tooltip-fade-leave-active) {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

:global(.struct-tooltip-fade-enter-from),
:global(.struct-tooltip-fade-leave-to) {
  opacity: 0;
  transform: translate(-50%, calc(-100% + 4px));
}

/* ==================== Пустое состояние ==================== */

.empty-state {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--ui-text-muted, #9ca3af);
}
</style>
