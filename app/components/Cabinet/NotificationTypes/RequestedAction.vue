<script setup lang="ts">
/**
 * Шаблон уведомления «Заявка на действие» (type === 'RequestedAction').
 * data: { title, text, type, approve_url, requested_action_id }
 *
 * data.type — фаза заявки: request | approved | rejected | done | error.
 * Только фаза `request` приёмщику можно принять/отклонить: тянем форму
 * принятия (GET approve-action/form) и шлём голос (POST approve-action/approve).
 * actionTypes — справочник типов действий (data.type => локализованное название).
 */
interface RequestedActionNotification {
  id: string
  type: string
  data: Record<string, unknown>
}

interface FormField {
  type: string
  value: unknown
}

/** Ответ approve-action/form — каждое поле {type, value}. */
interface ApprovalForm {
  title?: FormField
  text?: FormField
  approve?: FormField
}

/** Ответ approve-action/approve. */
interface ApprovalResponse {
  id: number
  result: 'accepted' | 'declined' | 'waiting' | 'closed'
  status: string
}

const props = defineProps<{
  item: RequestedActionNotification
  /** Справочник типов действий: value => локализованное название. */
  actionTypes: Record<string, string>
}>()

const emit = defineEmits<{ decided: [id: string] }>()

const api = useApi()
const toast = useToast()

const title = computed(() => {
  const value = props.item.data?.title
  return typeof value === 'string' && value ? value : 'Уведомление'
})

const text = computed(() => {
  const value = props.item.data?.text
  return typeof value === 'string' ? value : ''
})

const actionTypeLabel = computed(() => {
  const actionType = props.item.data?.type
  if (typeof actionType !== 'string') return ''
  return props.actionTypes[actionType] || ''
})

/** Приёмщику ждёт решения только по фазе `request`. */
const isActionable = computed(() => props.item.data?.type === 'request')

/**
 * Заявка исполнена: фаза `request`, но действие уже выполнено (status === 'done').
 * Только для такого случая вместо кнопок показываем статус (см. CabinetQueryStatus).
 */
const isDone = computed(() =>
  props.item.data?.type === 'request' && props.item.data?.status === 'done',
)

/** Решение по заявке (accepted/declined) — уходит в CabinetQueryStatus. */
const doneDecisionValue = computed<'accepted' | 'declined' | null>(() => {
  const value = props.item.data?.decision
  if (value === 'accepted' || value === 'declined') return value
  return null
})

const requestedActionId = computed(() => {
  const value = props.item.data?.requested_action_id
  return typeof value === 'number' ? value : Number(value) || 0
})

/**
 * Параметры формы принятия берём из `approve_url` (action=alias&id=N):
 * alias обработчика в уведомлении отдельным ключом не приходит.
 */
const approvalParams = computed<Record<string, string> | null>(() => {
  const url = props.item.data?.approve_url
  if (typeof url !== 'string' || !url) return null

  const questionMark = url.indexOf('?')
  if (questionMark === -1) return null

  const params = new URLSearchParams(url.slice(questionMark + 1))
  const action = params.get('action')
  const id = params.get('id') ?? (requestedActionId.value ? String(requestedActionId.value) : null)
  if (!action || !id) return null

  return { action, id }
})

const formLoading = ref(false)
const formLoaded = ref(false)
const submitting = ref<'accept' | 'decline' | null>(null)
const decision = ref<'accepted' | 'declined' | null>(null)

const form = ref<ApprovalForm | null>(null)

const approveText = computed(() => {
  const value = form.value?.text?.value
  return typeof value === 'string' && value ? value : text.value
})

async function loadForm() {
  if (!approvalParams.value || formLoading.value) return
  formLoading.value = true
  try {
    form.value = await api.get<ApprovalForm>('/approve-action/form', {
      params: approvalParams.value,
    })
    formLoaded.value = true
  } catch {
    // Ошибка уже показана тостом в useApi (403/404/409/422).
  } finally {
    formLoading.value = false
  }
}

async function submit(approve: boolean) {
  if (!approvalParams.value || submitting.value || decision.value) return
  submitting.value = approve ? 'accept' : 'decline'
  try {
    const res = await api.post<ApprovalResponse>('/approve-action/approve', {
      ...approvalParams.value,
      approve,
    })

    if (res.result === 'accepted' || res.result === 'declined') {
      decision.value = res.result
      toast.add({
        title: res.result === 'accepted' ? 'Запрос принят' : 'Запрос отклонён',
        color: res.result === 'accepted' ? 'success' : 'error',
        icon: res.result === 'accepted' ? 'i-lucide-circle-check' : 'i-lucide-circle-x',
      })
      emit('decided', props.item.id)
    } else if (res.result === 'waiting') {
      // waiting — голос учтён, ждём остальных приёмщиков.
      toast.add({
        title: 'Голос учтён',
        description: 'Ожидаем ответа остальных получателей.',
        color: 'neutral',
        icon: 'i-lucide-clock',
      })
      emit('decided', props.item.id)
    }
    // closed — запрос уже закрыт: показываем текст уведомления.
  } catch {
    // Ошибка уже показана тостом в useApi (403/404/409/422).
  } finally {
    submitting.value = null
  }
}

// Форма загружается по кнопке «Загрузить заявку», а не автоматически при отрисовке:
// иначе каждая карточка в списке шлёт approve-action/form на маунте.

</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-2">
      <span class="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ui-text-muted,#6b7280)]">
        <UIcon name="i-lucide-send" class="size-4" />
        Заявка
      </span>
      <span
        v-if="actionTypeLabel"
        class="shrink-0 rounded-full bg-[var(--ui-bg-elevated,#f3f4f6)] px-2 py-0.5 text-xs text-[var(--ui-text-muted,#6b7280)]"
      >
        {{ actionTypeLabel }}
      </span>
    </div>
    <p class="mt-2 text-[15px] font-medium leading-snug text-[var(--ui-text-highlighted,#111827)]">
      {{ title }}
    </p>
    <p v-if="approveText" class="mt-1 text-sm leading-relaxed text-[var(--ui-text,#374151)]">
      {{ approveText }}
    </p>

    <!-- Действие уже выполнено — вместо кнопок действий статус с решением -->
    <div v-if="isDone" class="mt-3">
      <CabinetQueryStatus status="done" :decision="doneDecisionValue" />
    </div>

    <!-- Приёмщик: принять / отклонить -->
    <template v-else-if="isActionable">
      <div v-if="decision" class="mt-3 flex items-center gap-1.5 text-sm font-medium"
           :class="decision === 'accepted'
             ? 'text-[var(--ui-color-success,#16a34a)]'
             : 'text-[var(--ui-color-error,#dc2626)]'"
      >
        <UIcon :name="decision === 'accepted' ? 'i-lucide-circle-check' : 'i-lucide-circle-x'" class="size-4" />
        {{ decision === 'accepted' ? 'Запрос принят' : 'Запрос отклонён' }}
      </div>

      <div v-else-if="formLoaded" class="mt-3 flex items-center gap-2">
        <UButton
          color="primary"
          size="sm"
          icon="i-lucide-check"
          label="Принять"
          :loading="submitting === 'accept'"
          :disabled="submitting !== null"
          @click="submit(true)"
        />
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-x"
          label="Отклонить"
          :loading="submitting === 'decline'"
          :disabled="submitting !== null"
          @click="submit(false)"
        />
      </div>

      <div v-else-if="formLoading" class="mt-3 flex items-center gap-1.5 text-xs text-[var(--ui-text-muted,#6b7280)]">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        Загрузка…
      </div>

      <div v-else class="mt-3 flex items-center gap-2">
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-refresh-cw"
          label="Загрузить заявку"
          @click="loadForm"
        />
      </div>
    </template>
  </div>
</template>
