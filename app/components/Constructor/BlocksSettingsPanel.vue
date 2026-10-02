<script setup lang="ts">
import BlocksSettingField from '~/components/Constructor/BlocksSettingField.vue'

const props = defineProps<{
  settings: SettingItem[] | null | undefined
}>()

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
    <template v-if="settings?.length">
      <BlocksSettingField
        v-for="(item, index) in settings"
        :key="item.key"
        :model-value="item"
        @update:model-value="updateItem(index, $event)"
      />
    </template>

    <div v-else class="empty-state">
      <UIcon name="i-heroicons-adjustments-horizontal" class="empty-icon" />
      <span>Нет настроек</span>
    </div>
  </div>
</template>

<style scoped>
.properties {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--ui-text-muted, #9ca3af);
}

.empty-icon {
  font-size: 24px;
  opacity: 0.6;
}
</style>
