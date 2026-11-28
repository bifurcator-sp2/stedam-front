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
  /** Связь пользователя (например, teacher / student). */
  relation?: string
  /** Роль второй стороны связи. */
  counterpartRole?: string
  /** Сразу загрузить первую страницу списка при монтировании. */
  autoLoad?: boolean
  /**
   * Режим работы:
   * - search — выбор пользователя (как раньше, через v-model);
   * - list — только список; клик по элементу эмитит user-pressed, выбор не сохраняется.
   */
  mode?: 'search' | 'list'
  placeholder?: string
}>(), {
  roles: () => [],
  relation: undefined,
  counterpartRole: undefined,
  autoLoad: false,
  mode: 'search',
  placeholder: 'Имя, фамилия, e-mail или ID',
})

const emit = defineEmits<{
  /** Клик по пользователю в режиме list (объект целиком). */
  userPressed: [user: UserListItem]
}>()

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
        relation: props.relation || undefined,
        counterpart_role: props.counterpartRole || undefined,
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

// Первую страницу грузим только по явному запросу (autoLoad).
onMounted(() => {
  if (props.autoLoad) loadUsers(true)
})

// Дебаунс ввода: поиск стартует только от 3 символов
watch(searchInput, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const term = val.trim()
    if (term.length < 3) {
      // В режиме list сброс поиска возвращает к первой странице списка.
      if (props.mode === 'list') {
        loadUsers(true)
        return
      }
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
  // В режиме list только сообщаем о нажатии, выбор не сохраняем.
  if (props.mode === 'list') {
    emit('userPressed', user)
    return
  }
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
      v-if="selected && mode !== 'list'"
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

    <!-- Поиск (в режиме list виден всегда) -->
    <div v-if="!selected || mode === 'list'" class="relative">
      <UIcon
        name="i-lucide-search"
        class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ui-text-muted,#9ca3af)]"
      />
      <input
        v-model="searchInput"
        type="text"
        inputmode="search"
        :placeholder="placeholder"
        class="w-full border-0 border-b border-[var(--ui-border,#e5e7eb)] bg-[var(--ui-bg,#ffffff)] py-1 pl-7 pr-7 text-xs leading-4 text-[var(--ui-text-highlighted,#111827)] outline-none transition focus:border-b-[var(--ui-primary,#4f46e5)]"
      >
      <button
        v-if="searchInput"
        type="button"
        class="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-[var(--ui-text-muted,#9ca3af)] hover:text-[var(--ui-text-highlighted,#111827)]"
        aria-label="Очистить"
        @click="clearSearch"
      >
        <UIcon name="i-lucide-x" class="size-3.5" />
      </button>
    </div>

    <!-- Список результатов -->
    <LoadingOverlay v-if="!selected || mode === 'list'" :loading="loading" class="flex flex-col gap-1">
      <p v-if="error" class="py-4 text-center text-sm text-[var(--ui-color-error,#dc2626)]">
        {{ error }}
      </p>

      <p v-else-if="!users.length && !loading && searchInput.trim().length >= 3" class="py-4 text-center text-sm text-[var(--ui-text-muted,#6b7280)]">
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
    </LoadingOverlay>
  </div>
</template>

<style scoped>

</style>
