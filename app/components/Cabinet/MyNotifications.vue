<script setup lang="ts">
/**
 * Элемент списка уведомлений (см. NotificationListResource на бэкенде).
 * type — значение NotificationType: request | approved | rejected | done | error
 */
interface NotificationItem {
  id: string
  type: string
  data: Record<string, unknown>
}

interface NotificationsMeta {
  current_page: number
  per_page: number
  has_more_pages: boolean
  from: number | null
  to: number | null
}

interface NotificationsResponse {
  data: NotificationItem[]
  meta: NotificationsMeta
  /** Справочник типов уведомлений: value => локализованное название. */
  types: Record<string, string>
  /** Справочник типов действий (data.type): value => локализованное название. */
  action_types: Record<string, string>
}

/** Иконка по типу уведомления. */
const TYPE_ICONS: Record<string, string> = {
  request: 'i-lucide-inbox',
  approved: 'i-lucide-circle-check',
  rejected: 'i-lucide-circle-x',
  done: 'i-lucide-check-check',
  error: 'i-lucide-triangle-alert',
}

const api = useApi()

const searchInput = ref('')
const items = ref<NotificationItem[]>([])
const typesByName = ref<Record<string, string>>({})
const actionTypesByName = ref<Record<string, string>>({})
const loading = ref(false)
const error = ref<string | null>(null)
const page = ref(1)
const hasMore = ref(false)

// Защита от гонок: учитываем только ответ последнего запроса
let requestSeq = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function loadNotifications(reset = false) {
  if (reset) {
    page.value = 1
    hasMore.value = false
  }

  const seq = ++requestSeq
  loading.value = true
  error.value = null

  try {
    const res = await api.get<NotificationsResponse>('/notifications', {
      params: {
        search: searchInput.value.trim() || undefined,
        page: page.value,
        per_page: 20,
      },
      refresh: true,
    })

    if (seq !== requestSeq) return

    items.value = reset ? res.data : [...items.value, ...res.data]
    hasMore.value = res.meta.has_more_pages
    typesByName.value = res.types ?? {}
    actionTypesByName.value = res.action_types ?? {}
  } catch {
    if (seq !== requestSeq) return
    error.value = 'Не удалось загрузить уведомления'
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function loadMore() {
  if (loading.value || !hasMore.value) return
  page.value += 1
  loadNotifications(false)
}

// Дебаунс ввода: ищем от 3 символов, иначе показываем всё (сброс)
watch(searchInput, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const term = val.trim()
    if (term.length > 0 && term.length < 3) return
    loadNotifications(true)
  }, 400)
})

function clearSearch() {
  searchInput.value = ''
}

function typeLabel(item: NotificationItem): string {
  // Локализованный тип действия из data.type (request/approved/...),
  // иначе — тип уведомления (RequestedAction и т.п.).
  const actionType = item.data?.type
  if (typeof actionType === 'string') {
    const label = actionTypesByName.value[actionType]
    if (label) return label
  }
  return typesByName.value[item.type] || item.type
}

function typeIcon(item: NotificationItem): string {
  return TYPE_ICONS[item.type] || 'i-lucide-bell'
}

function title(item: NotificationItem): string {
  const value = item.data?.title
  return typeof value === 'string' && value ? value : 'Уведомление'
}

function text(item: NotificationItem): string {
  const value = item.data?.text ?? item.data?.message
  return typeof value === 'string' ? value : ''
}

onMounted(() => loadNotifications(true))

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<template>
  <!-- Не короче вьюпорта, даже когда контента нет или идёт загрузка -->
  <div class="flex flex-col min-h-dvh bg-[var(--ui-bg,#ffffff)]">
    <main class="flex-1 flex flex-col px-4 py-6">
      <div class="mx-auto w-full max-w-md">
        <h1 class="text-xl font-semibold text-[var(--ui-text-highlighted,#111827)]">
          Уведомления
        </h1>
        <p class="mt-1 text-sm text-[var(--ui-text-muted,#6b7280)]">
          Поиск по заголовку уведомлений
        </p>

        <!-- Поиск -->
        <div class="relative mt-5">
          <UIcon
            name="i-lucide-search"
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ui-text-muted,#9ca3af)]"
          />
          <input
            v-model="searchInput"
            type="text"
            inputmode="search"
            placeholder="Поиск уведомлений"
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

        <!-- Список -->
        <div class="mt-4 flex flex-col gap-2">
          <div v-if="loading && !items.length" class="flex items-center justify-center gap-2 py-6 text-sm text-[var(--ui-text-muted,#6b7280)]">
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
            Загрузка…
          </div>

          <p v-else-if="error" class="py-4 text-center text-sm text-[var(--ui-color-error,#dc2626)]">
            {{ error }}
          </p>

          <p v-else-if="!items.length" class="py-4 text-center text-sm text-[var(--ui-text-muted,#6b7280)]">
            Уведомлений нет
          </p>

          <template v-else>
            <article
              v-for="item in items"
              :key="item.id"
              class="rounded-2xl border border-[var(--ui-border,#e5e7eb)] bg-[var(--ui-bg,#ffffff)] p-4"
            >
              <!-- Заявка на действие (RequestedAction) — отдельный шаблон -->
              <CabinetNotificationTypesRequestedAction
                v-if="item.type === 'RequestedAction'"
                :item="item"
                :action-types="actionTypesByName"
                @decided="loadNotifications(true)"
              />

              <!-- Обычное уведомление -->
              <template v-else>
                <div class="flex items-start gap-3">
                  <span
                    class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ui-primary,#4f46e5)]/10 text-[var(--ui-primary,#4f46e5)]"
                  >
                    <UIcon :name="typeIcon(item)" class="size-5" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <span class="block truncate text-[15px] font-medium text-[var(--ui-text-highlighted,#111827)]">
                      {{ title(item) }}
                    </span>
                    <span class="mt-0.5 inline-block rounded-full bg-[var(--ui-bg-elevated,#f3f4f6)] px-2 py-0.5 text-xs text-[var(--ui-text-muted,#6b7280)]">
                      {{ typeLabel(item) }}
                    </span>
                    <p v-if="text(item)" class="mt-1 text-sm leading-relaxed text-[var(--ui-text,#374151)]">
                      {{ text(item) }}
                    </p>
                  </div>
                </div>
              </template>
            </article>

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
    </main>
  </div>
</template>

<style scoped>

</style>
