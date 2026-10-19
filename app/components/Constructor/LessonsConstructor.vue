<script setup lang="ts">
// app/components/Constructor/LessonsConstructor.vue

import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'
import Lesson from '~/components/Constructor/Lesson.vue'
import BlocksSettingsPanel from '~/components/Constructor/BlocksSettingsPanel.vue'
import LoadingOverlay from '~/components/LoadingOverlay.vue'
import { mergeFlat, isPlainObject } from '~/utils/constructors'
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

// ==================== Состояние raw ====================
//
// NEW: рядом с lesson.blocks[i] (где settings — view для рендера/панели)
// храним raw-объект от сервера. Именно он уходит в save payload.
//
// rawStates[localId] = {
//   raw:             глубокий клон settings из ответа сервера,
//   lastSyncedView:  снимок view на момент последней синхронизации raw.
// }
//
// При save делаем patchRawFromViewDiff(raw, lastSyncedView, currentView),
// затем lastSyncedView = clone(currentView). Только изменённые листья.

interface RawState {
  raw: Record<string, any>
  lastSyncedView: any[]
}

const rawStates = ref<Record<string, RawState>>({})

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

function iconOfBlock(block: { settings?: any }): string {
  // settings — view SettingNode[], ищем icon
  if (Array.isArray(block.settings)) {
    const icon = block.settings.find((n: any) => n?.key === 'icon')?.default
    if (typeof icon === 'string' && icon) return icon
  }
  return 'i-lucide-file-text'
}

// ==================== Утилиты diff / patch ====================
// NEW: точечный патч raw по diff двух view-деревьев.

import { toRaw } from 'vue'

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

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (typeof a !== typeof b) return false
  if (Array.isArray(a)) {
    return Array.isArray(b)
      && a.length === b.length
      && a.every((x, i) => deepEqual(x, b[i]))
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]))
  }
  return false
}

function setValueByPath(obj: Record<string, any>, path: string[], value: any) {
  let cur: any = obj
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}
    cur = cur[k]
  }
  cur[path[path.length - 1]] = value
}

function patchRawFromViewDiff(
  raw: Record<string, any>,
  prevView: any[],
  nextView: any[],
  basePath: string[],
) {
  const prevByKey = new Map<string, any>(prevView.map((n: any) => [n.key, n]))

  for (const nextNode of nextView) {
    const prevNode = prevByKey.get(nextNode.key)
    const nodePath = [...basePath, nextNode.key]
    const hasChildren = Array.isArray(nextNode.children) && nextNode.children.length > 0

    if (hasChildren) {
      if (!prevNode || !deepEqual(prevNode.default, nextNode.default)) {
        setValueByPath(raw, [...nodePath, 'default'], nextNode.default)
      }
      patchRawFromViewDiff(
        raw,
        prevNode?.children ?? [],
        nextNode.children!,
        nodePath,
      )
    } else {
      if (!prevNode || !deepEqual(prevNode.default, nextNode.default)) {
        setValueByPath(raw, nodePath, nextNode.default)
      }
    }
  }
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
const isProgrammatic = ref(false)

async function loadLesson(id: number) {
  loading.value = true
  loadError.value = null

  try {
    const res = await api.get<{ data: LessonResponse } | LessonResponse>(`/lessons/${id}`)
    const data = (res as any).data ?? res

    // NEW: сбрасываем raw-состояния
    const nextRawStates: Record<string, RawState> = {}

    const blocks: LessonBlockModel[] = (data.blocks ?? []).map((b: any) => {
      const type = structItems.value.find((t) => t.code === b.block_type_code)

      // view строим ТОЛЬКО из серверного settings + схема.
      // sourceBlock.settings (прототип) сюда не подмешиваем — сервер уже
      // финализировал settings (syncFileSetsFromSettings + cloneFileSetsFromModel).
      const view = mergeFlat(
        type?.default_settings ?? [],
        b.settings ?? undefined,
        undefined,
      )

      const localId = crypto.randomUUID()
      nextRawStates[localId] = {
        raw: deepClone(b.settings ?? {}),
        lastSyncedView: deepClone(view),
      }

      return {
        localId,
        id: b.id,
        blockId: b.block_id ?? null,
        blockTypeCode: b.block_type_code ?? '',
        settings: view,
      }
    })

    isProgrammatic.value = true
    rawStates.value = nextRawStates
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

// ==================== NEW: syncMissingRaw ====================
//
// Когда Lesson.vue через DnD/duplicate добавляет блок, он сам POST'ит
// на сервер и кладёт новый блок в lesson.blocks (только с view — raw
// у нас нет). Этот watcher видит новый localId без rawStates и подтягивает
// raw через GET /lessons/{id}.

async function syncMissingRaw() {
  if (!lesson.value.id) return

  const missing = lesson.value.blocks.filter((b) => !rawStates.value[b.localId] && b.id > 0)
  if (missing.length === 0) return

  try {
    const res = await api.get<{ data: LessonResponse } | LessonResponse>(
      `/lessons/${lesson.value.id}`,
    )
    const data = (res as any).data ?? res

    const byId = new Map<number, any>()
    for (const sb of data.blocks ?? []) {
      byId.set(sb.id, sb)
    }

    for (const block of missing) {
      const sb = byId.get(block.id)
      if (!sb) continue

      rawStates.value[block.localId] = {
        raw: deepClone(sb.settings ?? {}),
        lastSyncedView: deepClone(block.settings ?? []),
      }
    }
  } catch (e) {
    console.error('[syncMissingRaw] failed', e)
  }
}

watch(
  () => lesson.value.blocks.map((b) => b.localId).join(','),
  async () => {
    if (!lesson.value.id) return

    // Подчищаем rawStates для удалённых блоков
    const currentIds = new Set(lesson.value.blocks.map((b) => b.localId))
    for (const id of Object.keys(rawStates.value)) {
      if (!currentIds.has(id)) delete rawStates.value[id]
    }

    // Подтягиваем raw для новых
    await syncMissingRaw()
  },
)

// ==================== Сохранение ====================

const saving = ref(false)

const busy = computed(() =>
  loading.value || creating.value || saving.value,
)

async function save() {
  if (!lesson.value.id) return

  saving.value = true
  try {
    // 0. Гарантируем, что у каждого блока есть raw
    await syncMissingRaw()

    // 1. Патчим raw по diff: lastSyncedView → текущий view.
    //    Ключи, которых нет в view (не описаны схемой), в raw не трогаются.
    for (const block of lesson.value.blocks) {
      const state = rawStates.value[block.localId]
      if (!state) continue

      patchRawFromViewDiff(
        state.raw,
        state.lastSyncedView,
        block.settings,
        [],
      )
      state.lastSyncedView = deepClone(block.settings)
    }

    // 2. Payload: settings = raw как есть. Никаких unmergeFlat.
    //    images/files не отправляем — сервер их не читает.
    const payload: LessonSavePayload = {
      title: lesson.value.title,
      description: lesson.value.description,
      locale: lesson.value.locale,
      saved: true,
      published: lesson.value.published,
      blocks: lesson.value.blocks.map((block) => ({
        id: block.id,
        settings: rawStates.value[block.localId]?.raw ?? {},
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

    // 3. Сервер — истина: пересобираем view и raw из ответа.
    const nextRawStates: Record<string, RawState> = {}

    const updatedBlocks: LessonBlockModel[] = (data.blocks ?? []).map((b: any) => {
      const type = structItems.value.find((t) => t.code === b.block_type_code)

      const view = mergeFlat(
        type?.default_settings ?? [],
        b.settings ?? undefined,
        undefined,
      )

      const localId = crypto.randomUUID()
      nextRawStates[localId] = {
        raw: deepClone(b.settings ?? {}),
        lastSyncedView: deepClone(view),
      }

      return {
        localId,
        id: b.id,
        blockId: b.block_id ?? null,
        blockTypeCode: b.block_type_code ?? '',
        settings: view,
      }
    })

    isProgrammatic.value = true
    rawStates.value = nextRawStates
    lesson.value = {
      ...lesson.value,
      saved: data.saved ?? true,
      published: data.published ?? lesson.value.published,
      blocks: updatedBlocks,
    }

    // 4. Восстанавливаем активный блок по серверному id (localId сменился)
    activeBlockLocalId.value =
      updatedBlocks.find((b) => b.id === prevActiveId)?.localId ?? null
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

// Панель работает с view (SettingNode[]). Правки панели пишутся в view,
// а raw патчится при save через diff.
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
        <div class="flex flex-col gap-1.5 p-2.5">
          <div v-if="structPending" class="px-4 py-8 text-center text-[13px] text-(--ui-text-muted)">
            Загрузка…
          </div>
          <div v-else-if="structError" class="px-4 py-8 text-center text-[13px] text-(--ui-text-muted)">
            Не удалось загрузить структуру
          </div>
          <div v-else-if="structItems.length === 0" class="px-4 py-8 text-center text-[13px] text-(--ui-text-muted)">
            Пока ничего нет
          </div>

          <template v-else>
            <div
              v-for="type in structItems"
              :key="type.id"
              class="rounded-lg border bg-(--ui-bg) transition-[border-color,box-shadow] hover:border-(--ui-primary)"
              :class="openTypeId === type.id
                ? 'border-(--ui-primary) shadow-[0_1px_3px_rgba(59,130,246,0.08)]'
                : 'border-(--ui-border)'"
            >
              <button
                type="button"
                class="relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-(--ui-text) transition-colors hover:bg-(--ui-bg-muted)"
                :class="openTypeId === type.id
                  ? 'rounded-b-none border-b border-(--ui-border)'
                  : ''"
                @click="toggleType(type.id)"
                @mouseenter="showTooltip($event, type.description)"
                @mouseleave="hideTooltip"
              >
                <span
                  class="inline-flex h-4 w-4 shrink-0 items-center justify-center text-(--ui-text-muted) transition-[transform,color] duration-200"
                  :class="openTypeId === type.id ? 'rotate-90 text-(--ui-primary)' : ''"
                >
                  <UIcon name="i-lucide-chevron-right" class="h-4 w-4" />
                </span>

                <UIcon
                  :name="iconOf(type)"
                  class="h-4 w-4 shrink-0 text-(--ui-text-muted)"
                  :class="openTypeId === type.id ? '!text-(--ui-primary)' : ''"
                />

                <span
                  class="relative min-w-0 flex-1 overflow-hidden font-medium whitespace-nowrap"
                  @mouseenter="onNameEnter(type.id, $event)"
                  @mouseleave="onNameLeave"
                >
                  <span
                    class="struct-name__inner inline-block whitespace-nowrap transition-transform duration-300 ease-out will-change-transform"
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
                  class="inline-flex h-[18px] min-w-[22px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums"
                  :class="type.blocks_count === 0
                    ? 'text-(--ui-text-muted)'
                    : 'text-(--ui-primary)'"
                  :style="{
                    background: type.blocks_count === 0
                      ? 'var(--ui-bg-muted)'
                      : 'color-mix(in srgb, var(--ui-primary) 10%, transparent)',
                  }"
                >
                  {{ type.blocks_count }}
                </span>
              </button>

              <Transition name="struct-expand">
                <div
                  v-if="openTypeId === type.id"
                  class="flex flex-col gap-0.5 rounded-b-lg bg-(--ui-bg-elevated) p-1.5"
                >
                  <div
                    v-if="type.blocks.length === 0"
                    class="px-2 py-2.5 text-center text-xs text-(--ui-text-muted)"
                  >
                    Блоков этого типа пока нет
                  </div>

                  <template v-else>
                    <div
                      v-for="block in type.blocks"
                      :key="block.id"
                      class="group flex w-full cursor-grab items-center gap-2 rounded-[5px] bg-transparent px-2 py-1.5 text-left text-xs text-(--ui-text) transition-[background,color,box-shadow] select-none hover:bg-(--ui-bg) hover:text-(--ui-primary) hover:shadow-[0_1px_2px_rgba(15,23,42,0.05)] active:cursor-grabbing"
                      draggable="true"
                      @dragstart="onBlockDragStart($event, type, block)"
                      @dragend="onBlockDragEnd"
                      @mouseenter="showTooltip($event, block.description)"
                      @mouseleave="hideTooltip"
                    >
                      <UIcon
                        :name="iconOfBlock(block)"
                        class="h-3.5 w-3.5 shrink-0 text-(--ui-text-muted) group-hover:text-(--ui-primary)"
                      />
                      <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                        {{ block.title || `Блок №${block.id}` }}
                      </span>
                      <span class="shrink-0 font-mono text-[10px] text-(--ui-text-muted)">
                        #{{ block.id }}
                      </span>
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
      <div class="flex min-w-0 items-center gap-2">
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
        />
      </LoadingOverlay>
    </template>

    <!-- ==================== RIGHT HEADER ==================== -->
    <template #right-header>
      <span>Свойства</span>

      <div class="flex min-w-0 items-center gap-2">
        <Transition name="autosave-fade">
          <span
            v-if="autosaveRemaining !== null"
            class="inline-flex items-center gap-[5px] rounded-full border border-(--ui-border) bg-(--ui-bg-elevated) px-2 py-[3px] text-[11px] font-semibold tabular-nums text-(--ui-text-muted)"
            :title="`Автосохранение произойдет через ${autosaveRemaining} с`"
          >
            <UIcon name="i-lucide-save" class="h-3 w-3 text-(--ui-primary)" />
            <span class="min-w-[10px] text-center">
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
      </LoadingOverlay>
    </template>
  </ConstructPanels>

  <!-- ==================== Тултип ==================== -->
  <Teleport to="body">
    <Transition name="struct-tooltip-fade">
      <div
        v-if="tooltip.visible"
        class="pointer-events-none fixed z-[9999] max-w-[260px] min-w-[80px] -translate-x-1/2 -translate-y-full rounded-md bg-gray-900/95 px-2.5 py-1.5 text-center text-[11px] leading-snug font-normal text-white shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
        :style="{
          left: `${tooltip.x}px`,
          top: `${tooltip.y}px`,
        }"
      >
        {{ tooltip.text }}
        <span class="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-900/95" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ==================== Transition-хуки Vue ==================== */

.autosave-fade-enter-active,
.autosave-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.autosave-fade-enter-from,
.autosave-fade-leave-to {
  opacity: 0;
  transform: translateX(4px);
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

.struct-tooltip-fade-enter-active,
.struct-tooltip-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.struct-tooltip-fade-enter-from,
.struct-tooltip-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-100% + 4px));
}
</style>
