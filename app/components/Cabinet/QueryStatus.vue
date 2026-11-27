<script setup lang="ts">
/**
 * Визуализация статуса заявки (requested action).
 *
 * Единый компонент для двух контекстов:
 *  - список «Мои заявки» (RequestedActionItem): status + localized_status + decision;
 *  - уведомления (RequestedAction): data.status/data.decision приведены к тем же пропсам.
 *
 * Режимы:
 *  - status === 'done' и decision accepted/declined → «Обработано — Принято/Отклонено»;
 *  - иначе — бейдж статуса с иконкой и локализованным названием.
 *
 * Компонент презентационный: данные приходят через пропсы.
 */
const props = withDefaults(defineProps<{
  /** Статус заявки: created | pending | approved | rejected | done | error. */
  status?: string | null
  /** Локализованное название статуса с бэкенда (localized_status). */
  label?: string | null
  /** Решение по заявке: accepted | declined (или null, пока не принято). */
  decision?: 'accepted' | 'declined' | string | null
}>(), {
  status: null,
  label: null,
  decision: null,
})

/** Иконка по статусу заявки. */
const STATUS_ICONS: Record<string, string> = {
  created: 'i-lucide-inbox',
  pending: 'i-lucide-clock',
  approved: 'i-lucide-circle-check',
  rejected: 'i-lucide-circle-x',
  done: 'i-lucide-check-check',
  error: 'i-lucide-triangle-alert',
}

const MUTED = 'var(--ui-text-muted,#6b7280)'
const SUCCESS = 'var(--ui-color-success,#16a34a)'
const ERROR = 'var(--ui-color-error,#dc2626)'

/** Решение по заявке: accepted/declined. */
const decisionMeta = computed<{ label: string, color: string } | null>(() => {
  if (props.decision === 'accepted') return { label: 'Принято', color: SUCCESS }
  if (props.decision === 'declined') return { label: 'Отклонено', color: ERROR }
  return null
})

/**
 * Режим «Обработано — решение»: заявка исполнена (status === 'done') и есть решение.
 * Для этого режима бейдж статуса не показываем — он заменяется строкой с решением.
 */
const isDone = computed(() => props.status === 'done' && decisionMeta.value !== null)

const statusIcon = computed(() => STATUS_ICONS[props.status ?? ''] || 'i-lucide-bell')
const statusLabel = computed(() => props.label || props.status || '')
</script>

<template>
  <!-- Исполненная заявка: Обработано (серым) — решение (зелёным/красным) -->
  <div
    v-if="isDone"
    class="flex items-center gap-1.5 text-sm font-medium"
  >
    <UIcon name="i-lucide-check-check" class="size-4" :style="{ color: MUTED }" />
    <span :style="{ color: MUTED }">Обработано</span>
    <template v-if="decisionMeta">
      <span :style="{ color: MUTED }">—</span>
      <span :style="{ color: decisionMeta.color }">{{ decisionMeta.label }}</span>
    </template>
  </div>

  <!-- Обычный статус заявки: бейдж с иконкой -->
  <span
    v-else
    class="inline-flex items-center gap-1 rounded-full bg-[var(--ui-bg-elevated,#f3f4f6)] px-2 py-0.5 text-xs text-[var(--ui-text-muted,#6b7280)]"
  >
    <UIcon :name="statusIcon" class="size-3.5" />
    <span v-if="statusLabel">{{ statusLabel }}</span>
  </span>
</template>
