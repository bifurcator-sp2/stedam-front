<script setup lang="ts">
// ==================== Импорты ====================

import { ref, computed, watch } from 'vue'
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'

// ==================== Типы ====================

interface BlockStructItem {
  id: number
  code: string
  type: 'info' | 'task'
  name: string
  description: string | null
  default_settings: SettingNode[]
  blocks_count: number
  blocks: Array<{
    id: number
    block_type_id: number
    title: string | null
    description: string | null
    settings: SettingNode[]
  }>
}

// ==================== Зависимости ====================

const api = useApi()
const route = useRoute()
const router = useRouter()

// ==================== Загрузка структуры ====================

const {
  data: struct,
  pending,
  error,
} = await useAsyncData('block-types-struct', () =>
  api.get<{ data: BlockStructItem[] }>('/block-types/struct'),
)

const structItems = computed<BlockStructItem[]>(() => struct.value?.data ?? [])

// ==================== Аккордеон: только один открыт ====================

const openTypeId = ref<number | null>(null)

function toggleType(id: number) {
  openTypeId.value = openTypeId.value === id ? null : id
}

// ==================== Хелпер: иконка ====================

function iconOf(type: Pick<BlockStructItem, 'default_settings'>): string {
  const fields = Array.isArray(type.default_settings) ? type.default_settings : []
  const iconField = fields.find((f: any) => f.key === 'icon')
  return (iconField?.default as string | undefined) ?? 'i-lucide-square'
}

function iconOfBlock(block: { settings?: SettingNode[] | null }): string {
  const fields = Array.isArray(block.settings) ? block.settings : []
  const iconField = fields.find((f: any) => f.key === 'icon')
  return (iconField?.default as string | undefined) ?? 'i-lucide-file-text'
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

// ==================== Автоскролл длинных названий ====================

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

// ==================== Выбранный блок ====================

const editingItem = ref<{ id: number; title: string; description: string } | null>(null)
const saving = ref(false)

const centerTitle = computed(() => {
  if (editingItem.value) {
    return editingItem.value.id > 0
      ? `Редактирование №${editingItem.value.id}`
      : 'Создание'
  }
  return 'Список'
})

// ==================== Действия ====================

function openItem(id: number) {
  router.replace({ query: { id: String(id) } })
}

function addItem(typeId: number) {
  editingItem.value = { id: 0, title: '', description: '' }
  router.replace({ query: { add: '1', type: String(typeId) } })
}

async function save() {
  saving.value = true
  try {
    // TODO: реальное сохранение
  } finally {
    saving.value = false
  }
}

function reset() {
  editingItem.value = null
  router.replace({ query: {} })
}

// ==================== Watch: query ====================

watch(
  () => route.query.id,
  (id) => {
    if (!id || typeof id !== 'string') return
    // TODO: загрузить элемент по id
  },
  { immediate: true },
)

watch(
  () => route.query.add,
  (add) => {
    if (!add) return
    // TODO: инициализировать создание
  },
  { immediate: true },
)
</script>

<template>
  <ConstructPanels
    left-title="Типы блоков"
    :main-title="centerTitle"
    right-title="Свойства"
    :show-viewport-picker="!!editingItem"
  >
    <!-- ==================== LEFT ==================== -->
    <template #left>
      <div class="struct-panel">
        <!-- Загрузка -->
        <div v-if="pending" class="empty-state">Загрузка…</div>

        <!-- Ошибка -->
        <div v-else-if="error" class="empty-state">
          Не удалось загрузить структуру
        </div>

        <!-- Пусто -->
        <div v-else-if="structItems.length === 0" class="empty-state">
          Пока ничего нет
        </div>

        <!-- Аккордеон -->
        <template v-else>
          <div
            v-for="type in structItems"
            :key="type.id"
            class="struct-item"
            :class="{ 'struct-item--open': openTypeId === type.id }"
          >
            <!-- Хедер типа -->
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

              <!-- Кнопка «+» добавить блок этого типа -->
              <span
                class="struct-add"
                role="button"
                :aria-label="`Добавить блок «${type.name}»`"
                @click.stop="addItem(type.id)"
              >
                <UIcon name="i-lucide-plus" class="w-4 h-4" />
              </span>
            </button>

            <!-- Список блоков внутри типа -->
            <Transition name="struct-expand">
              <div v-if="openTypeId === type.id" class="struct-body">
                <div v-if="type.blocks.length === 0" class="struct-empty">
                  Блоков этого типа пока нет
                </div>

                <template v-else>
                  <button
                    v-for="block in type.blocks"
                    :key="block.id"
                    type="button"
                    class="struct-block"
                    @click="openItem(block.id)"
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
                  </button>
                </template>
              </div>
            </Transition>
          </div>
        </template>
      </div>
    </template>

    <!-- ==================== MAIN HEADER ==================== -->
    <template #main-header>
      <div class="main-header-inner">
        <span>{{ centerTitle }}</span>

        <UButton
          v-if="editingItem"
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
      <!-- === Режим редактирования === -->
      <template v-if="editingItem">
        <div class="center-placeholder">
          <UIcon name="i-lucide-pencil-ruler" class="center-placeholder__icon" />
          <span class="center-placeholder__label">
            Здесь будет редактор
          </span>
        </div>
      </template>

      <!-- === Режим списка === -->
      <template v-else>
        <div class="center-placeholder">
          <UIcon name="i-lucide-layout-list" class="center-placeholder__icon" />
          <span class="center-placeholder__label">
            Здесь будет список элементов
          </span>
        </div>
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
        :disabled="!editingItem || saving"
        @click="save"
      >
        Сохранить
      </UButton>
    </template>

    <!-- ==================== RIGHT ==================== -->
    <template #right>
      <div v-if="!editingItem" class="empty-state">
        Выберите элемент в центре.
      </div>

      <div v-else class="right-placeholder">
        <UIcon name="i-lucide-sliders-horizontal" class="right-placeholder__icon" />
        <span class="right-placeholder__label">
          Здесь будет панель настроек
        </span>
      </div>
    </template>
  </ConstructPanels>

  <!-- ==================== Тултип (вне панели, поверх всего) ==================== -->
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
/* ==================== Заголовок центральной панели ==================== */

.main-header-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* ==================== Аккордеон типов ==================== */

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

/* --- Хедер типа --- */

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

/* Шеврон */
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

/* Иконка типа */
.struct-icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: var(--ui-text-muted, #6b7280);
}

.struct-item--open .struct-icon {
  color: var(--ui-primary, #3b82f6);
}

/* Название типа — контейнер (обрезает) */
.struct-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  position: relative;
  font-weight: 500;
  white-space: nowrap;
}

/* Внутренний слой с текстом — двигается */
.struct-name__inner {
  display: inline-block;
  white-space: nowrap;
  transition: transform 0.4s ease;
  will-change: transform;
}

/* Счётчик */
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

/* Кнопка «+» */
.struct-add {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  color: var(--ui-text-muted, #9ca3af);
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}

.struct-item:hover .struct-add {
  opacity: 1;
}

.struct-add:hover {
  background: var(--ui-primary, #3b82f6);
  color: #ffffff;
}

/* --- Тело аккордеона --- */

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

/* --- Элемент блока --- */

.struct-block {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  text-align: left;
  font-size: 12px;
  color: var(--ui-text, #111827);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.struct-block:hover {
  background: var(--ui-bg, #ffffff);
  color: var(--ui-primary, #3b82f6);
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

/* --- Анимация раскрытия --- */

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

/* ==================== Тултип (Teleport в body) ==================== */

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

/* ==================== Заглушка центра ==================== */

.center-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 320px;
  padding: 48px 24px;
  color: var(--ui-text-muted, #9ca3af);
}

.center-placeholder__icon {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}

.center-placeholder__label {
  font-size: 14px;
}

/* ==================== Заглушка правой панели ==================== */

.right-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 24px;
  color: var(--ui-text-muted, #9ca3af);
}

.right-placeholder__icon {
  width: 40px;
  height: 40px;
  opacity: 0.5;
}

.right-placeholder__label {
  font-size: 13px;
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
