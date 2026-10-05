<script setup lang="ts">
interface SettingItem {
  key: string
  label: string
  type: 'string' | 'select' | 'int' | 'color'
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
  <div class="field" :class="{ 'field-group': model.children?.length }">
    <!-- Заголовок группы -->
    <div v-if="model.children?.length" class="field-group-header">
      <UIcon name="i-lucide-folder-tree" class="field-group-icon" />
      <span class="field-group-title">{{ model.label }}</span>
      <span class="field-group-key">{{ model.key }}</span>
    </div>

    <!-- Листовое поле: label + control в одну строку -->
    <template v-else>
      <div class="field-row">
        <label class="field-label" :title="model.key">{{ model.label }}</label>

        <UInput
          v-if="model.type === 'string'"
          v-model="model.default"
          size="xs"
          class="field-control"
        />
        <USelect
          v-else-if="model.type === 'select'"
          v-model="model.default"
          :items="model.allowed"
          size="xs"
          class="field-control"
        />
        <ColorPicker
          v-else-if="model.type === 'color'"
          v-model="model.default"
          :items="model.allowed ?? []"
          :columns="6"
          class="field-control"
        />
        <UInputNumber
          v-else-if="model.type === 'int'"
          v-model="model.default"
          size="xs"
          class="field-control"
        />
        <USwitch
          v-else-if="model.type === 'bool'"
          v-model="model.default"
          size="xs"
          class="field-control"
        />
      </div>
    </template>

    <!-- Дети -->
    <div v-if="model.children?.length" class="field-children">
      <BlocksSettingField
        v-for="(child, index) in model.children"
        :key="child.key"
        :model-value="child"
        @update:model-value="updateChild(index, $event)"
      />
    </div>
  </div>
</template>

<style scoped>
/* ====== Поле ====== */

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Листовая строка */
.field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  align-items: center;
  gap: 8px;
  min-height: 26px;
}

.field-label {
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--ui-text-muted, #6b7280);
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-control {
  min-width: 0;
}

/* ====== Группа ====== */

.field-group {
  gap: 6px;
  padding: 8px 8px 8px 10px;
  border: 1px solid var(--ui-border, #e5e7eb);
  border-radius: 6px;
  background: var(--ui-bg-elevated, #f9fafb);
}

.field-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ui-text, #111827);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field-group-icon {
  width: 13px;
  height: 13px;
  opacity: 0.55;
}

.field-group-title {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-group-key {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  font-weight: 400;
  color: var(--ui-text-muted, #9ca3af);
  text-transform: none;
  letter-spacing: 0;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
}

/* Вложенные группы — компактнее и с акцентной полосой */
.field-group .field-group {
  padding: 6px 6px 6px 8px;
  background: transparent;
}

.field-children {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 6px;
  margin-left: 2px;
  border-left: 2px solid var(--ui-border, #e5e7eb);
}

/* Уменьшаем внутренние отступы UInput/USelect/UInputNumber,
   чтобы панель стала компактнее */
.field-control :deep(input),
.field-control :deep(button) {
  padding-top: 2px;
  padding-bottom: 2px;
  font-size: 12.5px;
}
</style>
