<script setup lang="ts">
// app/components/Constructor/LessonBlockWrapper.vue
//
// Обёртка одного блока в уроке.
// Задачи:
//   1. Визуальное выделение активного блока.
//   2. Hover-панель с действиями: drag-handle, вверх, вниз, дублировать, удалить.
//   3. Клик/нажатие в любом месте (кроме панели действий) → активация.
//   4. Слот для самого блока (BlockRenderer).

import { ref } from 'vue'

// ==================== Props ====================

interface Props {
  /** Активен ли блок сейчас */
  active?: boolean
  /** Режим drag (включён ли drag-handle) */
  draggable?: boolean
  /** Можно ли двигать вверх */
  canMoveUp?: boolean
  /** Можно ли двигать вниз */
  canMoveDown?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  active: false,
  draggable: true,
  canMoveUp: false,
  canMoveDown: false,
})

// ==================== Эмиты ====================

const emit = defineEmits<{
  (e: 'activate'): void
  (e: 'remove'): void
  (e: 'duplicate'): void
  (e: 'move-up'): void
  (e: 'move-down'): void
}>()

// ==================== Ховер ====================

/**
 * Локальный флаг ховера.
 * Полностью управляет видимостью панели действий — независимо от props.active.
 * Это устраняет «залипание» панели после дублирования/перемещения,
 * когда блок остаётся активным, а мышь уже ушла.
 */
const hovered = ref(false)

function onMouseEnter() {
  hovered.value = true
}

function onMouseLeave() {
  hovered.value = false
}

// ==================== Активация ====================

function onActivate(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (!target) return

  // Клик по панели действий — не активируем
  if (target.closest('[data-block-action]')) return

  emit('activate')
}
</script>

<template>
  <div
    class="block-wrapper"
    :class="{
      'block-wrapper--active': props.active,
      'block-wrapper--draggable': props.draggable,
      'block-wrapper--hovered': hovered,
    }"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @mousedown="onActivate"
    @click="onActivate"
  >
    <!-- === Контент блока === -->
    <div class="block-wrapper__content">
      <slot />
    </div>

    <!-- === Hover-панель действий (справа, вертикально) === -->
    <div class="block-wrapper__actions" data-block-action>
      <!-- drag-handle — за него тащим -->
      <span
        v-if="props.draggable"
        class="block-wrapper__handle drag-handle"
        title="Перетащить"
        @mousedown.stop
        @click.stop
      >
        <UIcon name="i-lucide-grip-vertical" />
      </span>

      <!-- Вверх -->
      <button
        type="button"
        class="block-wrapper__btn"
        title="Переместить вверх"
        :disabled="!props.canMoveUp"
        @mousedown.stop
        @click.stop="emit('move-up')"
      >
        <UIcon name="i-lucide-chevron-up" />
      </button>

      <!-- Вниз -->
      <button
        type="button"
        class="block-wrapper__btn"
        title="Переместить вниз"
        :disabled="!props.canMoveDown"
        @mousedown.stop
        @click.stop="emit('move-down')"
      >
        <UIcon name="i-lucide-chevron-down" />
      </button>

      <!-- Дублировать -->
      <button
        type="button"
        class="block-wrapper__btn"
        title="Дублировать"
        @mousedown.stop
        @click.stop="emit('duplicate')"
      >
        <UIcon name="i-lucide-copy" />
      </button>

      <!-- Удалить -->
      <button
        type="button"
        class="block-wrapper__btn block-wrapper__btn--danger"
        title="Удалить"
        @mousedown.stop
        @click.stop="emit('remove')"
      >
        <UIcon name="i-lucide-trash-2" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.block-wrapper {
  position: relative;
  border-radius: 8px;
  padding: 6px;
  border: 2px solid transparent;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}

/* === Hover === */

.block-wrapper:hover {
  border-color: var(--ui-border, #e5e7eb);
}

/* === Активный === */

.block-wrapper--active {
  border-color: var(--ui-primary, #3b82f6);
  box-shadow: 0 0 0 3px var(--ui-primary-muted, rgba(59, 130, 246, 0.12));
}

/* === Hover-панель действий === */

.block-wrapper__actions {
  position: absolute;
  top: 0;
  /* Справа ОТ компонента: сдвигаем за правую границу на ширину панели */
  left: 100%;
  /* никакого margin-left — зазор между блоком и панелью делаем
     через ::before, чтобы не было «мёртвой зоны» для ховера */

  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 3px;

  border-radius: 7px;
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);

  opacity: 0;
  transform: translateX(-2px);
  transition: opacity 0.15s ease, transform 0.15s ease;
  pointer-events: none;
  z-index: 20;
}

/*
  Прозрачный «мостик» между блоком и панелью.
  Часть панели — поэтому ховер на нём = ховер на панели,
  и mouseleave на .block-wrapper не срабатывает при переходе мыши
  из блока в панель. Мёртвой зоны в зазоре нет.
*/
.block-wrapper__actions::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  right: 100%;
  width: 6px;
  background: transparent;
}

/*
  Показываем панель только по локальному ховеру.
  props.active НЕ управляет видимостью панели — иначе после
  дублирования/перемещения панель зависает в открытом виде.
*/
.block-wrapper--hovered .block-wrapper__actions {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}

/* === Ручка drag === */

.block-wrapper__handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  color: var(--ui-text-muted, #9ca3af);
  cursor: grab;
  touch-action: none;
  transition: background 0.15s ease, color 0.15s ease;
}

.block-wrapper__handle:hover {
  background: var(--ui-bg-muted, rgba(148, 163, 184, 0.12));
  color: var(--ui-text, #334155);
}

.block-wrapper__handle:active {
  cursor: grabbing;
}

.block-wrapper__handle :deep(svg) {
  width: 14px;
  height: 14px;
}

/* === Кнопки === */

.block-wrapper__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--ui-text-muted, #9ca3af);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.block-wrapper__btn:hover:not(:disabled) {
  background: var(--ui-bg-muted, rgba(148, 163, 184, 0.12));
  color: var(--ui-text, #334155);
}

.block-wrapper__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.block-wrapper__btn--danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.block-wrapper__btn :deep(svg) {
  width: 14px;
  height: 14px;
}
</style>
