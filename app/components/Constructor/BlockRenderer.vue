<script setup lang="ts">
// app/components/Constructor/BlockRenderer.vue
//
// Тонкая обёртка над <component :is>.
// Задачи:
//   1. Резолвит компонент блока по code через defineAsyncComponent.
//   2. Прокидывает стандартный набор пропсов (mode, id, screen).
//   3. Прокидывает v-model:settings.
//   4. Рендерит fallback-заглушку, если компонент не найден.

import { computed } from 'vue'
import { resolveBlockComponent, type SettingNode } from '~/utils/constructors'

// ==================== Props ====================

interface Props {
  code: string | null | undefined
  id?: number
  mode?: 'body' | 'form'
  showToDeleteImages?: boolean
  allowDragAndDrop?: boolean
  /** Готовые изображения — проброс в блок (например, text_image) */
  initialImages?: any[]
}

const props = withDefaults(defineProps<Props>(), {
  id: 0,
  mode: 'body',
  showToDeleteImages: false,
  allowDragAndDrop: true,
  initialImages: () => [],
})

// ==================== Модель ====================

const settings = defineModel<SettingNode[]>('settings', { default: () => [] })

// ==================== Эмиты ====================

const emit = defineEmits<{
  (e: 'register-files', inst: any): void
}>()

// ==================== Резолв компонента ====================

const component = computed(() => resolveBlockComponent(props.code))

const isResolved = computed(() => component.value !== null)

// ==================== Обработка register-files ====================

function onRegisterFiles(inst: any) {
  emit('register-files', inst)
}
</script>

<template>
  <!-- === Компонент найден — рендерим === -->
  <component
    :is="component"
    v-if="isResolved"
    v-model="settings"
    :id="props.id"
    :mode="props.mode"
    model-name="lesson_blocks"
    :show-to-delete-images="props.showToDeleteImages"
    :allow-drag-and-drop="props.allowDragAndDrop"
    :initial-images="props.initialImages"
    @register-files="onRegisterFiles"
  />

  <!-- === Компонент не найден — fallback === -->
  <div v-else class="unknown-block">
    <div class="unknown-block__icon">
      <UIcon name="i-lucide-alert-circle" />
    </div>
    <div class="unknown-block__body">
      <div class="unknown-block__title">Неизвестный тип блока</div>
      <code class="unknown-block__code">{{ props.code || '—' }}</code>
    </div>
  </div>
</template>

<style scoped>
.unknown-block {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px dashed var(--ui-border, #e5e7eb);
  background:
    linear-gradient(180deg, rgba(148, 163, 184, 0.05), transparent 12px),
    var(--ui-bg-elevated, #f8fafc);
  color: var(--ui-text-muted, #64748b);
}

.unknown-block__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
  color: var(--ui-text-muted, #94a3b8);
  flex-shrink: 0;
}

.unknown-block__icon :deep(svg) {
  width: 16px;
  height: 16px;
}

.unknown-block__body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.unknown-block__title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ui-text, #334155);
}

.unknown-block__code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
  color: var(--ui-text-muted, #64748b);
  align-self: flex-start;
}
</style>
