<script setup lang="ts">
import { computed, ref } from 'vue'

const model = defineModel<string>({ default: '' })

const props = defineProps<{
  items: string[]
  columns?: number
}>()

const open = ref(false)

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${props.columns ?? 6}, 1fr)`,
  gap: '4px',
}))

function select(token: string) {
  model.value = token
  open.value = false
}
</script>

<template>
  <UPopover v-model:open="open" :ui="{ content: 'p-2' }">
    <button
      type="button"
      class="picker-trigger"
      :title="model || 'Выбрать цвет'"
    >
      <ColorSwatch :token="model" :size="14" />
      <span class="picker-trigger__label">{{ model || '—' }}</span>
      <UIcon name="i-lucide-chevron-down" class="picker-trigger__chevron" />
    </button>

    <template #content>
      <div :style="gridStyle" class="picker-grid">
        <button
          v-for="token in items"
          :key="token"
          type="button"
          class="picker-cell"
          :class="{ 'picker-cell--active': token === model }"
          :title="token"
          @click="select(token)"
        >
          <ColorSwatch :token="token" :size="18" />
        </button>
      </div>
      <div class="picker-caption">{{ model || 'Ничего не выбрано' }}</div>
    </template>
  </UPopover>
</template>

<style scoped>
.picker-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 2px 6px;
  font-size: 11.5px;
  border: 1px solid var(--ui-border, #e5e7eb);
  border-radius: 6px;
  background: var(--ui-bg, #fff);
  color: var(--ui-text, #111827);
  cursor: pointer;
  text-align: left;
}

.picker-trigger__label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-trigger__chevron {
  width: 12px;
  height: 12px;
  opacity: 0.6;
}

.picker-grid {
  width: 200px;
}

.picker-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3px;
  border-radius: 4px;
  border: 1px solid transparent;
  cursor: pointer;
  background: transparent;
}

.picker-cell:hover {
  background: var(--ui-bg-elevated, #f3f4f6);
}

.picker-cell--active {
  border-color: var(--ui-primary, #3b82f6);
}

.picker-caption {
  margin-top: 6px;
  font-size: 10.5px;
  font-family: ui-monospace, monospace;
  color: var(--ui-text-muted, #6b7280);
  text-align: center;
}
</style>
