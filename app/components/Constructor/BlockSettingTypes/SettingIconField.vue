<!-- app/components/Constructor/BlockSettingTypes/SettingIconField.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { Vue3IconPicker } from 'vue3-icon-picker'
import 'vue3-icon-picker/dist/style.css'

const props = defineProps<{
  label: string
  value?: string | null
}>()

const emit = defineEmits<{
  update: [value: string]
}>()

const iconMode = ref<'manual' | 'picker'>('manual')

const iconValue = computed<string | null>(() => props.value ?? null)
const inputValue = computed(() => props.value ?? undefined)
</script>

<template>
  <div class="grid grid-cols-[60px_minmax(0,1fr)] items-start gap-3">
    <div
      class="relative flex size-[60px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-default bg-default p-2.5 shadow-sm transition"
      :class="!value ? 'border-dashed bg-elevated shadow-none' : ''"
    >
      <UIcon v-if="value" :name="value" class="size-full text-highlighted" />
      <UIcon v-else name="i-lucide-image-off" class="size-5 text-muted" />
    </div>

    <div class="flex min-w-0 flex-col gap-1.5">
      <div class="flex min-w-0 items-center justify-between gap-2">
        <span class="truncate text-[11.5px] font-semibold text-highlighted">
          {{ label }}
        </span>
        <span class="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-primary">
          {{ iconMode === 'manual' ? 'вручную' : 'из набора' }}
        </span>
        <slot name="actions" />
      </div>

      <div v-if="iconMode === 'manual'" class="flex min-w-0 items-center gap-1.5">
        <UInput
          :model-value="inputValue"
          size="xs"
          placeholder="i-lucide-hop"
          class="min-w-0 flex-1"
          @update:model-value="emit('update', $event)"
        />
        <UButton icon="i-lucide-grid-2x2" size="xs" color="neutral" variant="soft" square title="Выбрать из библиотеки" @click="iconMode = 'picker'" />
      </div>

      <div v-else class="flex min-w-0 items-center gap-1.5 relative z-50">
        <Vue3IconPicker
          :model-value="iconValue"
          placeholder="Поиск иконки..."
          icon-library="lucide"
          class="min-w-0 flex-1"
          @update:model-value="emit('update', $event)"
        />
        <UButton icon="i-lucide-keyboard" size="xs" color="neutral" variant="soft" square title="Ввести вручную" @click="iconMode = 'manual'" />
      </div>
    </div>
  </div>
</template>
