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
        class="absolute inset-0 z-10 bg-default/60 backdrop-blur-sm rounded-[inherit]"
      >
        <!-- Обертка sticky top-0 h-[100dvh] заставляет спиннер "прилипать" к центру экрана при скролле,
             а max-h-full не дает ей быть больше самого контейнера, если контент короткий -->
        <div class="sticky top-0 flex h-[100dvh] max-h-full w-full items-center justify-center">
          <UIcon
            name="i-lucide-loader-circle"
            class="w-6 h-6 animate-spin text-primary"
          />
        </div>
      </div>
    </Transition>
  </div>
</template>
