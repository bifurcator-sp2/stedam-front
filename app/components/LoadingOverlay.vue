<!-- app/components/LoadingOverlay.vue -->
<script setup lang="ts">
interface Props {
  loading?: boolean
}

withDefaults(defineProps<Props>(), {
  loading: false,
})
</script>

<template>
  <div class="relative">
    <slot />

    <Transition
      enter-active-class="transition-opacity duration-150"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="loading"
        class="absolute inset-0 z-10 flex items-center justify-center
               bg-default/60 backdrop-blur-sm rounded-[inherit]"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="w-6 h-6 animate-spin text-primary"
        />
      </div>
    </Transition>
  </div>
</template>
