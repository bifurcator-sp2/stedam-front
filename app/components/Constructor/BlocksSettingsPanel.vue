<script setup lang="ts">
import BlocksSettingField from '~/components/Constructor/BlocksSettingField.vue'

const props = defineProps<{
  settings: SettingItem[] | null | undefined
}>()

const title = defineModel<string | null>('title')
const description = defineModel<string | null>('description')
const id = defineModel<number | null>('id')

const emit = defineEmits<{
  (e: 'update:settings', value: SettingItem[]): void
}>()

function updateItem(index: number, updated: SettingItem) {
  if (!props.settings) return
  const next = props.settings.slice()
  next[index] = updated
  emit('update:settings', next)
}
</script>

<template>
  <div class="properties">
    <!-- Шапка с ID -->
    <div class="meta-row">
      <span class="meta-label">ID</span>
      <span class="meta-value">{{ id ?? '—' }}</span>
    </div>

    <!-- Основные поля -->
    <section class="section">
      <div class="field">
        <label class="field-label" for="block-name">Название блока</label>
        <UInput
          id="block-name"
          v-model="title"
          size="xs"
          placeholder="Введите название"
          class="w-full"
        />
      </div>

      <div class="field">
        <label class="field-label" for="block-description">Описание блока</label>
        <UTextarea
          id="block-description"
          v-model="description"
          size="xs"
          :rows="3"
          autoresize
          placeholder="Краткое описание"
          class="w-full"
        />
      </div>
    </section>

    <!-- Настройки -->
    <section class="section">
      <div class="section-header">
        <span class="section-title">Настройки</span>
        <span
          v-if="settings?.length"
          class="section-count"
        >
          {{ settings.length }}
        </span>
      </div>

      <div v-if="settings?.length" class="settings-list">
        <BlocksSettingField
          v-for="(item, index) in settings"
          :key="item.key"
          :model-value="item"
          @update:model-value="updateItem(index, $event)"
        />
      </div>

      <div v-else class="empty-state">
        <UIcon name="i-lucide-sliders-horizontal" class="empty-icon" />
        <span>Нет настроек</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.properties {
  padding: 12px 12px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ==================== Мета-строка (ID) ==================== */

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--ui-bg-elevated, #f9fafb);
  border: 1px solid var(--ui-border, #e5e7eb);
}

.meta-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-muted, #6b7280);
}

.meta-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--ui-text, #111827);
}

/* ==================== Секции ==================== */

.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 2px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-muted, #6b7280);
}

.section-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--ui-bg-muted, rgba(107, 114, 128, 0.12));
  color: var(--ui-text-muted, #6b7280);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

/* ==================== Поля ==================== */

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--ui-text-muted, #6b7280);
  padding-left: 2px;
}

/* ==================== Список настроек ==================== */

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ==================== Пустое состояние ==================== */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--ui-text-muted, #9ca3af);
  border: 1px dashed var(--ui-border, #e5e7eb);
  border-radius: 8px;
  background: var(--ui-bg-elevated, #f9fafb);
}

.empty-icon {
  font-size: 20px;
  opacity: 0.55;
}
</style>
