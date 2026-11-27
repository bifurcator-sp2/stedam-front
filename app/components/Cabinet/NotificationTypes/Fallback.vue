<script setup lang="ts">
/**
 * Универсальный шаблон уведомления.
 * Для типов без собственного шаблона: в data всегда есть title и text.
 */
interface FallbackNotification {
  id: string
  type: string
  data: Record<string, unknown>
}

const props = defineProps<{
  item: FallbackNotification
}>()

const title = computed(() => {
  const value = props.item.data?.title
  return typeof value === 'string' && value ? value : 'Уведомление'
})

const text = computed(() => {
  const value = props.item.data?.text
  return typeof value === 'string' ? value : ''
})
</script>

<template>
  <div class="flex items-start gap-3">
    <span
      class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ui-primary,#4f46e5)]/10 text-[var(--ui-primary,#4f46e5)]"
    >
      <UIcon name="i-lucide-bell" class="size-5" />
    </span>
    <div class="min-w-0 flex-1">
      <span class="block truncate text-[15px] font-medium text-[var(--ui-text-highlighted,#111827)]">
        {{ title }}
      </span>
      <p v-if="text" class="mt-1 text-sm leading-relaxed text-[var(--ui-text,#374151)]">
        {{ text }}
      </p>
    </div>
  </div>
</template>
