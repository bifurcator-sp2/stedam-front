<script setup lang="ts">
export interface UserCountry {
  id: number
  name: string
}

export interface UserListItem {
  id: number
  first_name: string | null
  last_name: string | null
  middle_name?: string | null
  full_name?: string | null
  avatar?: string | null
  country?: UserCountry | null
  /** Имена ролей пользователя, например ['teacher']. */
  roles?: string[]
}

interface RoleRef {
  name: string
  label: string | null
  description: string | null
}

interface UsersResponse {
  data: UserListItem[]
  meta: {
    current_page: number
    per_page: number
    has_more_pages: boolean
    from: number | null
    to: number | null
  }
  /** Справочник ролей с локализованными названиями — один на весь ответ. */
  roles?: RoleRef[]
}

const props = withDefaults(defineProps<{
  /** Роли, которым должен соответствовать пользователь (users обязан иметь ВСЕ). */
  roles?: string[]
  placeholder?: string
}>(), {
  roles: () => [],
  placeholder: 'Имя, фамилия, e-mail или ID',
})

const selected = defineModel<UserListItem | null>({ default: null })

const api = useApi()

const searchInput = ref('')
const users = ref<UserListItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const page = ref(1)
const hasMore = ref(false)
// Справочник ролей (имя -> локализованное название) из последнего ответа
const rolesByName = ref<Record<string, string>>({})

// Защита от гонок: учитываем только ответ последнего запроса
let requestSeq = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function loadUsers(reset = false) {
  if (reset) {
    page.value = 1
    hasMore.value = false
  }

  const seq = ++requestSeq
  loading.value = true
  error.value = null

  try {
    const res = await api.get<UsersResponse>('/users', {
      params: {
        search: searchInput.value.trim() || undefined,
        'roles[]': props.roles.length ? props.roles : undefined,
        page: page.value,
        per_page: 20,
      },
      refresh: true,
    })

    if (seq !== requestSeq) return

    users.value = reset ? res.data : [...users.value, ...res.data]
    hasMore.value = res.meta.has_more_pages

    if (res.roles?.length) {
      rolesByName.value = Object.fromEntries(
        res.roles.map(role => [role.name, role.label || role.name]),
      )
    }
  } catch {
    if (seq !== requestSeq) return
    error.value = 'Не удалось загрузить пользователей'
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function loadMore() {
  if (loading.value || !hasMore.value) return
  page.value += 1
  loadUsers(false)
}

// Дебаунс ввода: поиск стартует только от 3 символов
watch(searchInput, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const term = val.trim()
    if (term.length < 3) {
      // Сброс результата без запроса, если запрос уже был
      if (users.value.length || error.value) {
        requestSeq++
        users.value = []
        hasMore.value = false
        error.value = null
        loading.value = false
      }
      return
    }
    loadUsers(true)
  }, 400)
})

function clearSearch() {
  searchInput.value = ''
}

function displayName(user: UserListItem): string {
  return user.full_name
    || [user.last_name, user.first_name, user.middle_name].filter(Boolean).join(' ')
    || `Пользователь #${user.id}`
}

function initials(user: UserListItem): string {
  const source = user.first_name || user.last_name || user.full_name || ''
  return source
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('') || '?'
}

function roleLabels(user: UserListItem): string[] {
  return (user.roles ?? []).map(name => rolesByName.value[name] || name)
}

function selectUser(user: UserListItem) {
  selected.value = user
}

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- Выбранный пользователь -->
    <div
      v-if="selected"
      class="flex items-center gap-3 rounded-xl border border-[var(--ui-primary,#4f46e5)]/30 bg-[var(--ui-primary,#4f46e5)]/5 p-3"
    >
      <span class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--ui-primary,#4f46e5)]/15 text-sm font-medium text-[var(--ui-primary,#4f46e5)]">
        <img v-if="selected.avatar" :src="selected.avatar" :alt="displayName(selected)" class="size-full object-cover">
        <span v-else>{{ initials(selected) }}</span>
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-[var(--ui-text-highlighted,#111827)]">
          {{ displayName(selected) }}
        </p>
        <p class="truncate text-xs text-[var(--ui-text-muted,#6b7280)]">
          <template v-if="roleLabels(selected).length">
            {{ roleLabels(selected).join(', ') }}
          </template>
          <template v-else>
            #{{ selected.id }}
          </template>
          <template v-if="selected.country"> · {{ selected.country.name }}</template>
        </p>
      </div>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="Сбросить выбор"
        @click="selected = null"
      />
    </div>

    <!-- Поиск -->
    <div v-else class="relative">
      <UIcon
        name="i-lucide-search"
        class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ui-text-muted,#9ca3af)]"
      />
      <input
        v-model="searchInput"
        type="text"
        inputmode="search"
        :placeholder="placeholder"
        class="w-full rounded-xl border border-[var(--ui-border,#e5e7eb)] bg-[var(--ui-bg,#ffffff)] py-2.5 pl-9 pr-9 text-sm text-[var(--ui-text-highlighted,#111827)] outline-none transition focus:border-[var(--ui-primary,#4f46e5)]"
      >
      <button
        v-if="searchInput"
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--ui-text-muted,#9ca3af)] hover:text-[var(--ui-text-highlighted,#111827)]"
        aria-label="Очистить"
        @click="clearSearch"
      >
        <UIcon name="i-lucide-x" class="size-4" />
      </button>
    </div>

    <!-- Список результатов -->
    <div v-if="!selected" class="flex flex-col gap-1">
      <div v-if="loading && !users.length" class="flex items-center justify-center gap-2 py-6 text-sm text-[var(--ui-text-muted,#6b7280)]">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        Загрузка…
      </div>

      <p v-else-if="error" class="py-4 text-center text-sm text-[var(--ui-color-error,#dc2626)]">
        {{ error }}
      </p>

      <p v-else-if="!users.length && searchInput.trim().length >= 3" class="py-4 text-center text-sm text-[var(--ui-text-muted,#6b7280)]">
        Пользователи не найдены
      </p>

      <template v-else>
        <button
          v-for="user in users"
          :key="user.id"
          type="button"
          class="flex w-full items-center gap-3 rounded-xl border border-transparent p-2 text-left transition hover:bg-[var(--ui-bg-elevated,#f9fafb)]"
          @click="selectUser(user)"
        >
          <span class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--ui-bg-elevated,#f3f4f6)] text-xs font-medium text-[var(--ui-text-muted,#6b7280)]">
            <img v-if="user.avatar" :src="user.avatar" :alt="displayName(user)" class="size-full object-cover">
            <span v-else>{{ initials(user) }}</span>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-[var(--ui-text-highlighted,#111827)]">
              {{ displayName(user) }}
            </span>
            <span class="block truncate text-xs text-[var(--ui-text-muted,#6b7280)]">
              <template v-if="roleLabels(user).length">
                {{ roleLabels(user).join(', ') }}
              </template>
              <template v-else>
                #{{ user.id }}
              </template>
              <template v-if="user.country"> · {{ user.country.name }}</template>
            </span>
          </span>
          <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-[var(--ui-text-muted,#9ca3af)]" />
        </button>

        <UButton
          v-if="hasMore"
          block
          color="neutral"
          variant="ghost"
          size="sm"
          :loading="loading"
          label="Показать ещё"
          class="mt-1"
          @click="loadMore"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>

</style>
