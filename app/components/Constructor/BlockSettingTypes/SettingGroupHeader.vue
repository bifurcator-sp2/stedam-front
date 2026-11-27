<!-- app/components/Constructor/BlockSettingTypes/SettingGroupHeader.vue -->
<!-- Заголовок группы настроек (узел без type, с children). -->
<script setup lang="ts">
defineProps<{
  label: string
  fieldKey?: string
  expanded?: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <span
    v-if="expanded"
    class="pointer-events-none absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-r-sm bg-gradient-to-b from-primary/55 to-primary/5"
  />

  <div class="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-widest text-highlighted">
    <span
      class="inline-flex size-3.5 cursor-pointer items-center justify-center text-muted transition-transform duration-200 hover:text-highlighted"
      @click.stop="emit('toggle')"
    >
      <UIcon name="i-lucide-chevron-right" class="size-3.5 transition-transform duration-200" :class="{ 'rotate-90': expanded }" />
    </span>
    <UIcon name="i-lucide-folder-tree" class="size-3.5 text-primary/85" />
    <span class="flex-1 truncate">{{ label }}</span>
    <span v-if="fieldKey" class="rounded-full border border-default bg-default px-1.5 py-0.5 font-mono text-[9.5px] font-medium normal-case tracking-normal text-muted shadow-sm">
      {{ fieldKey }}
    </span>
    <slot name="actions" />
  </div>
</template>
