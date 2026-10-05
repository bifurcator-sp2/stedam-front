<script setup lang="ts">
import BlocksSettingField from '~/components/Constructor/BlocksSettingField.vue'

const props = defineProps<{
  settings: SettingItem[] | null | undefined
}>()

const name = defineModel<string | null>('name')
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
  <div class="properties">{{id}}
    <label class="field-label">Название блока</label>
    <UInput
      v-model="name"
      size="xs"
    />
    <label class="field-label">Описание блока</label>
    <UTextarea
      v-model="description"
      size="xs"
    />
    <template v-if="settings?.length">
      <BlocksSettingField
        v-for="(item, index) in settings"
        :key="item.key"
        :model-value="item"
        @update:model-value="updateItem(index, $event)"
      />
    </template>

    <div v-else class="empty-state">
      <UIcon name="i-lucide-sliders-horizontal" class="empty-icon" />
      <span>Нет настроек</span>
    </div>
  </div>
</template>

<style scoped>
.properties {
  padding: 10px 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 28px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--ui-text-muted, #9ca3af);
}

.empty-icon {
  font-size: 20px;
  opacity: 0.55;
}
</style>
