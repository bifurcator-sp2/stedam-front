<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    mode?: 'form' | 'body'
  }>(),
  {
    mode: 'body',
  },
)
</script>

<template>
  <div>
    <template v-if="mode === 'form'">
      <slot name="form" />
    </template>
    <template v-else>
      <slot name="body" />
    </template>
  </div>
</template>
