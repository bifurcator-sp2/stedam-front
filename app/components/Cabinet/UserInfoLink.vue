<script setup lang="ts">
/**
 * Текст с подстановкой имени пользователя вместо `$user`.
 * Имя берётся из объекта пользователя API (`user.name`) и оформляется как
 * ссылка с иконкой аватарки: по клику открывается всплывашка с id, именем и
 * заготовкой краткого профиля. Рендерится inline — встраивается в абзац.
 */
interface UserInfo {
  id?: number | string
  name?: unknown
  [key: string]: unknown
}

const props = defineProps<{
  /** Текст с плейсхолдером `$user`. */
  text?: string | null
  /** Пользователь для подстановки; имя берётся из `user.name`. */
  user?: UserInfo | null
}>()

// Для администратора во всплывашке доступна кнопка «войти как».
const { hasRole } = useAuth()
const isAdmin = computed(() => hasRole('admin'))
const canImpersonate = computed(() => {
  const id = props.user?.id
  return (typeof id === 'number' || typeof id === 'string') && id !== ''
})

type TextPart =
  | { kind: 'text'; value: string }
  | { kind: 'user'; value: string }

const userName = computed(() => {
  const name = props.user?.name
  return typeof name === 'string' && name ? name : '$user'
})

const parts = computed<TextPart[]>(() => {
  const raw = props.text ?? ''
  if (!raw || !raw.includes('$user')) return [{ kind: 'text', value: raw }]

  const chunks = raw.split('$user')
  return chunks.flatMap((chunk, index) => {
    const result: TextPart[] = []
    if (chunk) result.push({ kind: 'text', value: chunk })
    if (index < chunks.length - 1) result.push({ kind: 'user', value: userName.value })
    return result
  })
})
</script>

<template>
  <template v-for="(part, index) in parts" :key="index">
    <UPopover v-if="part.kind === 'user'" :ui="{ content: 'p-3' }">
      <button
        type="button"
        class="inline cursor-pointer font-medium text-[var(--ui-primary,#2563eb)] hover:underline"
      >
        <UIcon
          name="i-lucide-circle-user-round"
          class="mr-1 inline-block size-[1em] shrink-0 align-[-0.125em]"
        /><span>{{ part.value }}</span>
      </button>

      <template #content>
        <div class="max-w-64 text-sm text-[var(--ui-text,#374151)]">
          <p class="truncate text-[var(--ui-text-highlighted,#111827)]">
            <span v-if="user?.id !== undefined && user?.id !== null" class="text-[var(--ui-text-muted,#6b7280)]">
              #{{ user.id }} ·
            </span>
            {{ part.value }}
          </p>
          <p class="mt-1 text-[var(--ui-text-muted,#6b7280)]">
            В этом месте будет краткое публичное отображение профиля пользователя
          </p>
          <div v-if="isAdmin && canImpersonate" class="mt-3 border-t border-[var(--ui-border,#e5e7eb)] pt-2">
            <CabinetImpersonate :user-id="Number(user?.id)" :user-name="part.value" />
          </div>
        </div>
      </template>
    </UPopover>
    <template v-else>{{ part.value }}</template>
  </template>
</template>
