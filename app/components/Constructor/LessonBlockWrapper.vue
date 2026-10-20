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
 *
 * Панель находится ЗА пределами обёртки (left-full), поэтому простой
 * mouseleave на обёртке сбрасывает hovered ещё до того, как мышь дойдёт
 * до панели — и панель гаснет на полпути. Чтобы этого не было, в
 * mouseleave/mouseenter проверяем relatedTarget: если мышь переходит
 * между обёрткой и панелью — hovered не сбрасываем.
 */
const hovered = ref(false)

function onWrapperEnter() {
  hovered.value = true
}

function onWrapperLeave(e: MouseEvent) {
  const next = e.relatedTarget
  // Уходим в панель действий — не сбрасываем
  if (next instanceof Element && next.closest('[data-block-action]')) return
  hovered.value = false
}

function onPanelEnter() {
  hovered.value = true
}

function onPanelLeave(e: MouseEvent) {
  const next = e.relatedTarget
  // Возвращаемся в блок — не сбрасываем
  if (next instanceof Element && next.closest('.block-wrapper')) return
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
    class="block-wrapper relative rounded-lg  transition-[border-color,background,box-shadow] duration-150 hover:border-default"
    :class="{
      'border-primary shadow-[0_0_0_3px_var(--ui-primary-muted,rgba(59,130,246,0.12))]': props.active,
    }"
    @mouseenter="onWrapperEnter"
    @mouseleave="onWrapperLeave"
    @mousedown="onActivate"
    @click="onActivate"
  >
    <!-- === Контент блока === -->
    <div>
      <slot />
    </div>

    <!-- === Hover-панель действий (справа, вертикально) === -->
    <div
      class="absolute left-full top-0 z-20 flex -translate-x-0.5 flex-col items-center gap-1 rounded-lg border border-default bg-default p-1.5 shadow-md transition-[opacity,transform] duration-150"
      :class="hovered
        ? 'translate-x-0 opacity-100'
        : 'pointer-events-none opacity-0'"
      data-block-action
      @mouseenter="onPanelEnter"
      @mouseleave="onPanelLeave"
    >


      <!-- Вверх -->
      <button
        type="button"
        class="inline-flex size-11 items-center justify-center rounded-md text-muted transition hover:bg-muted/60 hover:text-highlighted disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted"
        title="Переместить вверх"
        :disabled="!props.canMoveUp"
        @mousedown.stop
        @click.stop="emit('move-up')"
      >
        <UIcon name="i-lucide-chevron-up" class="size-5" />
      </button>

      <!-- Вниз -->
      <button
        type="button"
        class="inline-flex size-11 items-center justify-center rounded-md text-muted transition hover:bg-muted/60 hover:text-highlighted disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted"
        title="Переместить вниз"
        :disabled="!props.canMoveDown"
        @mousedown.stop
        @click.stop="emit('move-down')"
      >
        <UIcon name="i-lucide-chevron-down" class="size-5" />
      </button>

      <!-- Дублировать -->
      <button
        type="button"
        class="inline-flex size-11 items-center justify-center rounded-md text-muted transition hover:bg-muted/60 hover:text-highlighted"
        title="Дублировать"
        @mousedown.stop
        @click.stop="emit('duplicate')"
      >
        <UIcon name="i-lucide-copy" class="size-5" />
      </button>

      <!-- Удалить -->
      <button
        type="button"
        class="inline-flex size-11 items-center justify-center rounded-md text-muted transition hover:bg-red-500/10 hover:text-red-500"
        title="Удалить"
        @mousedown.stop
        @click.stop="emit('remove')"
      >
        <UIcon name="i-lucide-trash-2" class="size-5" />
      </button>
    </div>
  </div>
</template>
