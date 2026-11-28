<script setup lang="ts">
/**
 * Элемент списка уведомлений (см. NotificationListResource на бэкенде).
 * type — значение NotificationType: request | approved | rejected | done | error
 */
interface NotificationItem {
  id: string
  type: string
  data: Record<string, unknown>
  /** Прочитано ли уведомление (с бэкенда). */
  read?: boolean
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

/** Прочитанные на клиенте, но ещё не отправленные на сервер id. */
const pendingReadIds = new Set<string>()
let readSyncInFlight = false

/** Уведомление прочитано (показано на экране): помечаем и ставим в очередь отправки. */
function onRead(id: string) {
  const item = items.value.find(i => i.id === id)
  if (!item) return
  item.read = true
  pendingReadIds.add(id)
}

/**
 * Отправка очереди прочитанности пачкой: PATCH /notifications
 * с notifications_ids[]. Успешные id убираем из очереди; при ошибке
 * оставляем до следующей попытки.
 */
async function flushReads() {
  if (readSyncInFlight || !pendingReadIds.size) return
  readSyncInFlight = true
  const ids = [...pendingReadIds]
  try {
    await api.patch('/notifications', {
      notifications_ids: ids,
    }, { silent: true })
    ids.forEach(id => pendingReadIds.delete(id))
  } catch {
    // Оставим id в очереди — повторим на следующем тике.
  } finally {
    readSyncInFlight = false
  }
}

let readSyncTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  loadNotifications(true)
  readSyncTimer = setInterval(flushReads, 1000)
})

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (readSyncTimer) {
    clearInterval(readSyncTimer)
    readSyncTimer = null
  }
  // Не теряем очередь при уходе со страницы.
  flushReads()
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
              class="rounded-2xl border bg-[var(--ui-bg,#ffffff)] p-4"
              :class="item.read
                ? 'border-[var(--ui-border,#e5e7eb)]'
                : 'border-[var(--ui-primary,#4f46e5)]'"
            >
              <!-- Заявка на действие (RequestedAction) — отдельный шаблон -->
              <CabinetNotificationTypesRequestedAction
                v-if="item.type === 'RequestedAction'"
                :item="item"
                :action-types="actionTypesByName"
                @decided="loadNotifications(true)"
                @read="onRead"
              />

              <!-- Обычное уведомление -->
              <CabinetNotificationTypesFallback
                v-else
                :item="item"
                @read="onRead"
              />
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
