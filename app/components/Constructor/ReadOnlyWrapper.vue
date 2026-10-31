<!-- app/components/Constructor/ReadOnlyWrapper.vue -->
<script setup lang="ts">
import { provide, ref } from 'vue'

// Переопределяем режим на "обучение" для всего, что внутри слота
provide('lesson-mode', ref('learn'))
</script>

<template>
  <slot />
</template>
