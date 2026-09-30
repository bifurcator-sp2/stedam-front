<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    mode?: 'form' | 'body'
    screen?: 'desktop' | 'tablet' | 'mobile'
  }>(),
  {
    mode: 'body',
    screen: 'desktop',
  },
)

const maxWidthClass = computed(() => {
  switch (props.screen) {
    case 'mobile':
      return 'max-w-[360px]'
    case 'tablet':
      return 'max-w-[640px]'
    case 'desktop':
    default:
      return 'w-full'
  }
})

</script>

<template>
  <div>
    <template v-if="mode === 'form'">
      <slot name="form" />
    </template>
    <template v-else>
      <div :class="maxWidthClass">
        <slot name="body" />
      </div>
    </template>
  </div>
</template>
