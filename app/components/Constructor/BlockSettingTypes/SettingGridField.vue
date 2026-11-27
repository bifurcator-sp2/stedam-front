<!-- app/components/Constructor/BlockSettingTypes/SettingGridField.vue -->
<!-- Однострочное поле «название — виджет»: select / content-type / layout /
     color / int / float / bool / multiselect. -->
<script setup lang="ts">
defineProps<{
  label: string
  fieldKey?: string
  type: string
  icon?: string
  value?: any
  allowed?: any[]
  collapsible?: boolean
  expanded?: boolean
}>()

const emit = defineEmits<{
  update: [value: any]
  toggle: []
}>()
</script>

<template>
  <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-center gap-2.5 rounded-md py-0.5 transition hover:bg-muted/40">
    <span class="flex min-w-0 items-center gap-1.5 pl-0.5">
      <span
        v-if="collapsible"
        class="inline-flex size-3.5 cursor-pointer items-center justify-center text-muted transition-transform duration-200 hover:text-highlighted"
        @click.stop="emit('toggle')"
      >
        <UIcon name="i-lucide-chevron-right" class="size-3.5 transition-transform duration-200" :class="{ 'rotate-90': expanded }" />
      </span>
      <UIcon :name="icon" class="size-3.5 shrink-0 text-muted" />
      <span class="truncate text-[12px] font-medium text-highlighted" :title="fieldKey ?? label">{{ label }}</span>
      <slot name="actions" />
    </span>

    <div class="min-w-0">
      <USelect
        v-if="['select', 'content-type', 'layout'].includes(type)"
        :model-value="value"
        :items="allowed"
        size="xs"
        class="w-full min-w-0 [&_button]:py-0.5 [&_button]:text-[12.5px]"
        @update:model-value="emit('update', $event)"
      />
      <USelectMenu
        v-else-if="type === 'multiselect'"
        :model-value="value"
        :items="allowed"
        multiple
        size="xs"
        class="w-full min-w-0 [&_button]:py-0.5 [&_button]:text-[12.5px]"
        @update:model-value="emit('update', $event)"
      />
      <ColorPicker
        v-else-if="type === 'color'"
        :model-value="value"
        :items="allowed ?? []"
        :columns="6"
        class="min-w-0"
        @update:model-value="emit('update', $event)"
      />
      <UInputNumber
        v-else-if="type === 'int'"
        :model-value="value"
        size="xs"
        class="min-w-0"
        @update:model-value="emit('update', $event)"
      />
      <UInputNumber
        v-else-if="type === 'float'"
        :model-value="value"
        :step="0.01 as any"
        size="xs"
        class="min-w-0"
        @update:model-value="emit('update', $event)"
      />
      <USwitch
        v-else-if="type === 'bool'"
        :model-value="value"
        size="xs"
        class="min-w-0"
        @update:model-value="emit('update', $event)"
      />
    </div>
  </div>
</template>
