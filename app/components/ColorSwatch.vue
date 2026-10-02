<script setup lang="ts">
import { computed } from 'vue'
import { parseColorToken, resolveCssVar } from '~/utils/color-tokens'

const props = defineProps<{
  token: string
  size?: number
}>()

const parsed = computed(() => parseColorToken(props.token))

const background = computed(() => {
  if (!parsed.value) return 'transparent'
  return resolveCssVar(parsed.value.cssVar, '#ccc')
})

const sizePx = computed(() => `${props.size ?? 14}px`)
</script>

<template>
  <span
    class="swatch"
    :style="{
      width: sizePx,
      height: sizePx,
      background,
      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)',
    }"
    :title="token"
  />
</template>

<style scoped>
.swatch {
  display: inline-block;
  border-radius: 3px;
  flex: 0 0 auto;
}
</style>
