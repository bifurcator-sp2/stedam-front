<script setup lang="ts">
interface SettingItem {
  key: string
  label: string
  type: 'string' | 'select' | 'int'
  default?: any
  allowed?: any[]
  children?: SettingItem[]
}

const model = defineModel<SettingItem>({ required: true })

function updateChild(index: number, updated: SettingItem) {
  if (!model.value.children) return
  const next = model.value.children.slice()
  next[index] = updated
  model.value = { ...model.value, children: next }
}
</script>

<template>
  <div class="field">
    <label class="field-label">{{ model.label }}</label>

    <!-- Группа с детьми -->
    <div v-if="model.children?.length" class="field-children">
      <BlocksSettingField
        v-for="(child, index) in model.children"
        :key="child.key"
        :model-value="child"
        @update:model-value="updateChild(index, $event)"
      />
    </div>

    <!-- Листовое поле -->
    <template v-else>
      <UInput
        v-if="model.type === 'string'"
        v-model="model.default"
        size="sm"
        class="w-full"
      />
      <USelect
        v-else-if="model.type === 'select'"
        v-model="model.default"
        :items="model.allowed"
        size="sm"
        class="w-full"
      />
      <UInputNumber
        v-else-if="model.type === 'int'"
        v-model="model.default"
        size="sm"
        class="w-full"
      />
    </template>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--ui-text-muted, #6b7280);
  letter-spacing: 0.01em;
}

.field-children {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-left: 12px;
  border-left: 2px solid var(--ui-border, #e5e7eb);
  margin-top: 4px;
}
</style>
