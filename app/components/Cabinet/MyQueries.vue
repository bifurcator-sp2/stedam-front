<script setup lang="ts">
import type { UserListItem } from './UsersSearch.vue'

type QueryAction = 'StudentToTeacher' | 'TeacherInviteStudent' | 'StudentToParent' | 'ParentInviteStudent'

interface QueryForm {
  /**
   * Шаблон запроса формы заявки.
   * `$user_id` подставляется id выбранного пользователя.
   */
  api: string
}

interface QueryRequest {
  /** Endpoint отправки заявки (POST). */
  api: string
  /**
   * Domain-параметры обработчика: ключ — имя поля запроса,
   * значение-шаблон подставляется из выбранного пользователя
   * (`$user_id` -> id выбранного пользователя).
   */
  params: Record<string, string>
}

interface QueryItem {
  title: string
  action: QueryAction
  /** Роли, по которым ищем пользователя для этой заявки. */
  roles: string[]
  form: QueryForm
  request: QueryRequest
}

/** Иконка (Lucide) по типу заявки. */
const ACTION_ICONS: Record<QueryAction, string> = {
  StudentToTeacher: 'i-lucide-graduation-cap',
  TeacherInviteStudent: 'i-lucide-user-plus',
  StudentToParent: 'i-lucide-users',
  ParentInviteStudent: 'i-lucide-book-open',
}

function actionIcon(query: QueryItem): string {
  return ACTION_ICONS[query.action] || 'i-lucide-send'
}

const queries: QueryItem[] = [
  {
    title: 'Записаться к преподавателю',
    action: 'StudentToTeacher',
    roles: ['teacher'],
    form: { api: '/request-action/form?teacher_id=$user_id&action=StudentToTeacher' },
    request: { api: '/request-action/request', params: { teacher_id: '$user_id' } },
  },
  {
    title: 'Пригласить ученика',
    action: 'TeacherInviteStudent',
    roles: ['student'],
    form: { api: '/request-action/form?student_id=$user_id&action=TeacherInviteStudent' },
    request: { api: '/request-action/request', params: { student_id: '$user_id' } },
  },
  {
    title: 'Найти родителей',
    action: 'StudentToParent',
    roles: ['parent'],
    form: { api: '/request-action/form?parent_id=$user_id&action=StudentToParent' },
    request: { api: '/request-action/request', params: { parent_id: '$user_id' } },
  },
  {
    title: 'Найти ребенка',
    action: 'ParentInviteStudent',
    roles: ['student'],
    form: { api: '/request-action/form?student_id=$user_id&action=ParentInviteStudent' },
    request: { api: '/request-action/request', params: { student_id: '$user_id' } },
  },
]

// Ответ формы согласия: каждое поле — { type, value }
interface FormField {
  type: string
  value: unknown
}

interface ConsentForm {
  title?: FormField
  text?: FormField
  approve?: FormField
}

interface RequestResult {
  id: number
  handler: string
  status: string
}

// ============================================================
// Список «моих заявок» (см. RequestedActionsController@index)
// ============================================================
interface RequestedActionRecipient {
  id: number
  name: string | null
  email: string | null
}

interface RequestedActionType {
  alias: string
  label: string
}

/** Элемент списка заявок (RequestedActionListResource на бэкенде). */
interface RequestedActionItem {
  id: number
  type: RequestedActionType
  status: string
  /** Решение по заявке: accepted | declined | null. */
  decision: 'accepted' | 'declined' | null
  localized_status: string
  complete: boolean
  error_code: string | null
  error_detail: string | null
  recipients: RequestedActionRecipient[]
  payload: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
}

interface ListMeta {
  current_page: number
  per_page: number
  has_more_pages: boolean
  from: number | null
  to: number | null
}

interface RequestedActionsResponse {
  data: RequestedActionItem[]
  meta: ListMeta
  /** Справочник типов заявок: alias => локализованное название. */
  types: RequestedActionType[]
}

/** Иконка по статусу заявки. */
const STATUS_ICONS: Record<string, string> = {
  created: 'i-lucide-inbox',
  pending: 'i-lucide-clock',
  approved: 'i-lucide-circle-check',
  rejected: 'i-lucide-circle-x',
  done: 'i-lucide-check-check',
  error: 'i-lucide-triangle-alert',
}

const searchInput = ref('')
const items = ref<RequestedActionItem[]>([])
const listLoading = ref(false)
const listError = ref<string | null>(null)
const listPage = ref(1)
const hasMore = ref(false)

// Защита от гонок: учитываем только ответ последнего запроса
let requestSeq = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function loadRequestedActions(reset = false) {
  if (reset) {
    listPage.value = 1
    hasMore.value = false
  }

  const seq = ++requestSeq
  listLoading.value = true
  listError.value = null

  try {
    const res = await api.get<RequestedActionsResponse>('/requested-actions', {
      params: {
        search: searchInput.value.trim() || undefined,
        page: listPage.value,
        per_page: 20,
      },
      refresh: true,
    })

    if (seq !== requestSeq) return

    items.value = reset ? res.data : [...items.value, ...res.data]
    hasMore.value = res.meta.has_more_pages
  } catch {
    if (seq !== requestSeq) return
    listError.value = 'Не удалось загрузить заявки'
  } finally {
    if (seq === requestSeq) listLoading.value = false
  }
}

function loadMore() {
  if (listLoading.value || !hasMore.value) return
  listPage.value += 1
  loadRequestedActions(false)
}

// Дебаунс ввода: ищем от 3 символов, иначе показываем всё (сброс)
watch(searchInput, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const term = val.trim()
    if (term.length > 0 && term.length < 3) return
    loadRequestedActions(true)
  }, 400)
})

function clearSearch() {
  searchInput.value = ''
}

function statusIcon(item: RequestedActionItem): string {
  return STATUS_ICONS[item.status] || 'i-lucide-bell'
}

function statusLabel(item: RequestedActionItem): string {
  return item.localized_status || item.status
}

function recipientLabel(recipient: RequestedActionRecipient): string {
  return recipient.name || recipient.email || `#${recipient.id}`
}

// «Смотреть как» доступно только администратору (см. Impersonate.vue).
const { hasRole } = useAuth()
const isAdmin = computed(() => hasRole('admin'))

// Переключение между списком и кнопками запросов
const isCreating = ref(false)

function startCreating() {
  isCreating.value = true
}

function cancelCreating() {
  isCreating.value = false
}

const isOpen = ref(false)
const selected = ref<QueryItem | null>(null)
const targetUser = ref<UserListItem | null>(null)

function openQuery(query: QueryItem) {
  selected.value = query
  targetUser.value = null
  isOpen.value = true
}

const api = useApi()
const toast = useToast()

const formRequestUrl = computed(() => {
  const template = selected.value?.form.api
  const userId = targetUser.value?.id
  if (!template || !userId) return null
  return template.replace('$user_id', String(userId))
})

const formLoading = ref(false)
const consent = ref<ConsentForm | null>(null)

watch(formRequestUrl, async (url) => {
  consent.value = null
  if (!url) return

  formLoading.value = true
  try {
    consent.value = await api.get<ConsentForm>(url)
  } finally {
    formLoading.value = false
  }
})

const formTitle = computed(() => String(consent.value?.title?.value ?? selected.value?.title ?? ''))
const formText = computed(() => String(consent.value?.text?.value ?? ''))

const submitting = ref(false)

function buildRequestBody(query: QueryItem, userId: number) {
  const body: Record<string, unknown> = { action: query.action }
  for (const [key, template] of Object.entries(query.request.params)) {
    body[key] = template.replace('$user_id', String(userId))
  }
  return body
}

async function submitRequest(close: () => void) {
  const query = selected.value
  const userId = targetUser.value?.id
  if (!query || !userId) return

  const body = { ...buildRequestBody(query, userId), approve: true }

  submitting.value = true
  try {
    const res = await api.post<RequestResult>(query.request.api, body)
    toast.add({
      title: 'Заявка отправлена',
      description: `Статус: ${res.status}`,
      color: 'success',
      icon: 'i-lucide-circle-check',
    })
    close()
  } catch {
    // ошибка уже показана тостом внутри useApi
  } finally {
    submitting.value = false
  }
}

onMounted(() => loadRequestedActions(true))

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<template>
  <!-- Не короче вьюпорта, даже когда контента нет или идёт загрузка -->
  <div class="flex flex-col min-h-dvh bg-[var(--ui-bg,#ffffff)]">
    <main class="flex-1 flex flex-col px-4 py-6">
      <div class="mx-auto w-full max-w-md">
        <!-- Шапка: заголовок и кнопка «Создать запрос» -->
        <div v-if="isCreating" class="flex items-center justify-between gap-3">
          <h1 class="text-xl font-semibold text-[var(--ui-text-highlighted,#111827)]">
            Создать запрос
          </h1>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-x"
            label="Отмена"
            @click="cancelCreating"
          />
        </div>
        <div v-else class="flex items-center justify-between gap-3">
          <h1 class="text-xl font-semibold text-[var(--ui-text-highlighted,#111827)]">
            Заявки
          </h1>
          <UButton
            icon="i-lucide-plus"
            size="sm"
            label="Создать запрос"
            @click="startCreating"
          />
        </div>

        <!-- Режим создания: кнопки запросов вместо списка -->
        <template v-if="isCreating">
          <p class="mt-1 text-sm text-[var(--ui-text-muted,#6b7280)]">
            Выберите действие, чтобы отправить заявку
          </p>

          <div class="mt-5 flex flex-col gap-3">
            <button
              v-for="query in queries"
              :key="query.action"
              type="button"
              class="group flex w-full items-center gap-3 rounded-2xl border border-[var(--ui-border,#e5e7eb)] bg-[var(--ui-bg,#ffffff)] p-4 text-left transition active:scale-[0.98] hover:border-[var(--ui-border-accented,#d1d5db)] hover:bg-[var(--ui-bg-elevated,#f9fafb)]"
              @click="openQuery(query)"
            >
              <span
                class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--ui-primary,#4f46e5)]/10 text-[var(--ui-primary,#4f46e5)]"
              >
                <UIcon :name="actionIcon(query)" class="size-6" />
              </span>
              <span class="flex-1 text-[15px] font-medium leading-tight text-[var(--ui-text-highlighted,#111827)]">
                {{ query.title }}
              </span>
              <UIcon
                name="i-lucide-chevron-right"
                class="size-5 shrink-0 text-[var(--ui-text-muted,#9ca3af)] transition group-hover:translate-x-0.5"
              />
            </button>
          </div>
        </template>

        <!-- Режим просмотра: пагинируемый список уведомлений -->
        <template v-else>
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
            <div v-if="listLoading && !items.length" class="flex items-center justify-center gap-2 py-6 text-sm text-[var(--ui-text-muted,#6b7280)]">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
              Загрузка…
            </div>

            <p v-else-if="listError" class="py-4 text-center text-sm text-[var(--ui-color-error,#dc2626)]">
              {{ listError }}
            </p>

            <p v-else-if="!items.length" class="py-4 text-center text-sm text-[var(--ui-text-muted,#6b7280)]">
              Заявок нет
            </p>

            <template v-else>
              <article
                v-for="item in items"
                :key="item.id"
                class="flex items-start gap-3 rounded-2xl border border-[var(--ui-border,#e5e7eb)] bg-[var(--ui-bg,#ffffff)] p-4"
              >
                <span
                  class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ui-primary,#4f46e5)]/10 text-[var(--ui-primary,#4f46e5)]"
                >
                  <UIcon :name="statusIcon(item)" class="size-5" />
                </span>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[15px] font-medium text-[var(--ui-text-highlighted,#111827)]">
                    {{ item.type.label }}
                  </div>
                  <div class="mt-1">
                    <CabinetQueryStatus
                      :status="item.status"
                      :label="statusLabel(item)"
                      :decision="item.decision"
                    />
                  </div>
                  <div v-if="item.recipients.length" class="mt-1 flex flex-col gap-1">
                    <div
                      v-for="recipient in item.recipients"
                      :key="recipient.id"
                      class="flex items-center gap-1.5 text-sm leading-relaxed text-[var(--ui-text,#374151)]"
                    >
                      <span class="truncate">{{ recipientLabel(recipient) }}</span>
                      <CabinetImpersonate
                        v-if="isAdmin"
                        :user-id="recipient.id"
                        :user-name="recipientLabel(recipient)"
                      />
                    </div>
                  </div>
                  <p v-if="item.error_detail" class="mt-1 text-sm leading-relaxed text-[var(--ui-color-error,#dc2626)]">
                    {{ item.error_detail }}
                  </p>
                </div>
              </article>

              <UButton
                v-if="hasMore"
                block
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="listLoading"
                label="Показать ещё"
                class="mt-1"
                @click="loadMore"
              />
            </template>
          </div>
        </template>
      </div>

      <UModal
        v-model:open="isOpen"
        :title="selected?.title"
        :description="selected ? 'Найдите и выберите пользователя для заявки' : undefined"
      >
        <template #body>
          <CabinetUsersSearch
            v-if="selected"
            v-model="targetUser"
            :roles="selected.roles"
          />

          <div v-if="targetUser" class="mt-4">
            <div v-if="formLoading" class="flex items-center gap-2 py-4 text-sm text-[var(--ui-text-muted,#6b7280)]">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
              Загрузка формы…
            </div>

            <div v-else-if="consent" class="rounded-xl border border-[var(--ui-border,#e5e7eb)] p-4">
              <h3 class="text-base font-semibold text-[var(--ui-text-highlighted,#111827)]">
                {{ formTitle }}
              </h3>
              <p v-if="formText" class="mt-2 text-sm leading-relaxed text-[var(--ui-text,#374151)]">
                {{ formText }}
              </p>
            </div>
          </div>
        </template>

        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Отмена" :disabled="!targetUser" @click="close" />
            <UButton
              label="Отправить запрос"
              :disabled="!targetUser || !consent"
              :loading="submitting"
              @click="submitRequest(close)"
            />
          </div>
        </template>
      </UModal>
    </main>
  </div>
</template>

<style scoped>

</style>
