<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'
import TaxonomySelector from '~/components/Constructor/TaxonomySelector.vue'
import LoadingOverlay from '~/components/LoadingOverlay.vue'
import CourseEdit from '~/components/Constructor/CourseEdit.vue'

// ==================== Зависимости ====================

const api = useApi()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { locale } = useI18n()

// ==================== Константы контракта POST /courses ====================

const LOCALES = [
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' }
] as const

const TITLE_MAX = 255
const DESCRIPTION_MAX = 5000

// ==================== Модель формы ====================

interface CourseForm {
  title: string
  description: string
  locale: string
  taxonomy_ids: number[]
}

function createEmptyForm(): CourseForm {
  return {
    title: '',
    description: '',
    locale: locale.value || 'ru',
    taxonomy_ids: []
  }
}

const form = ref<CourseForm>(createEmptyForm())

// ==================== Режим: создание или редактирование по ?id ====================

const courseId = computed<number | null>(() => {
  const raw = route.query.id
  const v = Array.isArray(raw) ? raw[0] : raw
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
})

const isEditMode = computed(() => courseId.value !== null)

// ==================== Утилита: валидный ?tax из query ====================

function getValidTaxFromQuery(): number | null {
  const raw = route.query.tax
  const v = Array.isArray(raw) ? raw[0] : raw
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

// ==================== Валидация ====================

const titleError = computed(() => {
  const t = form.value.title.trim()
  if (t.length === 0) return 'Укажите название курса'
  if (t.length > TITLE_MAX) return `Не больше ${TITLE_MAX} символов`
  return null
})

const descriptionError = computed(() => {
  const d = form.value.description.trim()
  if (d.length === 0) return 'Укажите описание курса'
  if (d.length > DESCRIPTION_MAX) return `Не больше ${DESCRIPTION_MAX} символов`
  return null
})

const taxonomyError = computed(() =>
  form.value.taxonomy_ids.length === 0 ? 'Выберите раздел' : null
)

// ==================== Статус отправки ====================

const creating = ref(false)
const serverErrors = ref<string[]>([])

const centerTitle = 'Новый курс'

// ==================== Создание курса ====================

// Пока форма невалидна — статус по первой незаполненной группе полей
const validationHint = computed(() => {
  if (taxonomyError.value) return 'Выберите раздел курса'
  if (titleError.value) return 'Укажите название курса'
  if (descriptionError.value) return 'Укажите описание курса'
  return null
})

// ==================== Тело запроса (контракт POST /api/courses) ====================

const requestPayload = computed(() => ({
  title: form.value.title.trim(),
  description: form.value.description.trim(),
  locale: form.value.locale,
  tax_id: form.value.taxonomy_ids[0] ?? null
}))

const requestPreview = computed(() => JSON.stringify(requestPayload.value, null, 2))

async function createCourse() {
  if (creating.value) return

  if (validationHint.value) {
    toast.add({
      title: 'Проверьте форму',
      description: validationHint.value,
      color: 'warning',
      icon: 'i-lucide-triangle-alert'
    })
    return
  }

  creating.value = true
  serverErrors.value = []

  try {
    const res = await api.post<{ data?: { id: number }, id?: number }>(
      '/courses',
      requestPayload.value,
      { silent: true }
    )
    const courseId = res?.data?.id ?? res?.id

    toast.add({
      title: 'Курс создан',
      description: 'Курс сохранён. Теперь можно наполнять его темами и уроками.',
      color: 'success',
      icon: 'i-lucide-check-circle'
    })

    if (courseId) {
      router.push({ path: route.path, query: { id: String(courseId) } })
    }
  } catch (e: unknown) {
    console.error('[createCourse] failed', e)

    const data = (e as { data?: { errors?: Record<string, string[]>, message?: string } })?.data
    const errors = data?.errors
    serverErrors.value = errors && typeof errors === 'object'
      ? Object.values(errors).flat().filter(Boolean).map(String)
      : [data?.message || 'Не удалось создать курс']

    toast.add({
      title: 'Ошибка',
      description: serverErrors.value[0] || 'Не удалось создать курс',
      color: 'error',
      icon: 'i-lucide-triangle-alert'
    })
  } finally {
    creating.value = false
  }
}

// ==================== Предупреждение при уходе со страницы ====================

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (isEditMode.value) return
  const dirty = form.value.title !== ''
    || form.value.description !== ''
    || form.value.taxonomy_ids.length > 0
  if (!dirty) return
  event.preventDefault()
  event.returnValue = ''
}

// ==================== Lifecycle ====================

onMounted(() => {
  if (!isEditMode.value) {
    const tax = getValidTaxFromQuery()
    if (tax !== null) form.value.taxonomy_ids = [tax]
  }
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <CourseEdit
    v-if="isEditMode"
    :course-id="courseId!"
  />

  <ConstructPanels
    v-else
    :main-title="centerTitle"
    right-title="Параметры курса"
    :display-viewport-selector="false"
    :display-left="false"
  >
    <template #main-header>
      <div class="flex min-w-0 items-center gap-2">
        <span>{{ centerTitle }}</span>
      </div>
    </template>

    <template #main-header-right>
      <UButton
        icon="i-lucide-plus"
        size="sm"
        color="primary"
        variant="solid"
        :loading="creating"
        :disabled="creating"
        @click="createCourse"
      >
        Создать курс
      </UButton>
    </template>

    <template #main>
      <LoadingOverlay :loading="creating">
        <div class="mx-auto w-full max-w-[834px] px-6 py-8">
          <div class="rounded-xl border border-default bg-default p-6">
            <h2 class="text-base font-bold text-highlighted">
              {{ centerTitle }}
            </h2>
            <p class="mt-1 text-xs text-muted">
              Заполните шапку курса. Темы и уроки добавляются после создания курса.
            </p>

            <div
              v-if="serverErrors.length"
              class="mt-5 rounded-lg border border-error/30 bg-error/5 p-3"
            >
              <div class="flex items-start gap-2 text-[13px] text-error">
                <UIcon
                  name="i-lucide-circle-x"
                  class="mt-0.5 size-4 shrink-0"
                />
                <ul class="list-disc space-y-1 pl-4">
                  <li
                    v-for="(err, i) in serverErrors"
                    :key="i"
                  >
                    {{ err }}
                  </li>
                </ul>
              </div>
            </div>

            <div class="mt-6 flex flex-col gap-5">
              <!-- Раздел -->
              <div>
                <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Раздел <span class="text-error">*</span>
                </label>
                <TaxonomySelector v-model="form.taxonomy_ids" />
              </div>

              <!-- Язык -->
              <div>
                <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Язык курса <span class="text-error">*</span>
                </label>
                <select
                  v-model="form.locale"
                  class="h-8 w-full rounded-md border border-default bg-default px-2 text-sm text-highlighted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option
                    v-for="l in LOCALES"
                    :key="l.value"
                    :value="l.value"
                  >
                    {{ l.label }}
                  </option>
                </select>
              </div>

              <!-- Название -->
              <div>
                <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Название <span class="text-error">*</span>
                </label>
                <UInput
                  v-model="form.title"
                  size="sm"
                  :maxlength="TITLE_MAX"
                  placeholder="Например: Основы Python"
                  class="w-full"
                  :color="form.title && titleError ? 'error' : undefined"
                />
                <p
                  v-if="form.title && titleError"
                  class="mt-1 text-[11px] text-error"
                >
                  {{ titleError }}
                </p>
              </div>

              <!-- Описание -->
              <div>
                <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Описание <span class="text-error">*</span>
                </label>
                <UTextarea
                  v-model="form.description"
                  size="sm"
                  :rows="4"
                  autoresize
                  :maxlength="DESCRIPTION_MAX"
                  placeholder="Для кого и о чём этот курс"
                  class="w-full"
                  :color="form.description && descriptionError ? 'error' : undefined"
                />
                <p
                  v-if="form.description && descriptionError"
                  class="mt-1 text-[11px] text-error"
                >
                  {{ descriptionError }}
                </p>
              </div>

              <div class="flex items-center justify-end gap-2 border-t border-default pt-4">
                <UButton
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  :disabled="creating"
                  @click="router.push('/teacher-courses')"
                >
                  Отмена
                </UButton>
                <UButton
                  icon="i-lucide-check"
                  size="sm"
                  color="primary"
                  variant="solid"
                  :loading="creating"
                  :disabled="creating"
                  @click="createCourse"
                >
                  Создать курс
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </LoadingOverlay>
    </template>

    <template #right-header>
      <div class="flex w-full items-center justify-between gap-2">
        <span>Параметры курса</span>
      </div>
    </template>

    <template #right>
      <div class="flex flex-col gap-4 bg-default p-4">
        <div class="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Тело запроса
        </div>

        <pre class="overflow-x-auto rounded-lg border border-default bg-elevated/40 p-3 font-mono text-[11px] leading-relaxed text-highlighted">{{ requestPreview }}</pre>

        <div class="mt-auto flex flex-col gap-2">
          <div
            v-if="validationHint"
            class="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-2 text-[11px] text-muted"
          >
            <UIcon
              name="i-lucide-info"
              class="mt-0.5 size-3.5 shrink-0 text-warning"
            />
            <span>{{ validationHint }}. Обязательные поля: раздел, название и описание.</span>
          </div>

          <UButton
            icon="i-lucide-plus"
            color="primary"
            variant="soft"
            block
            :loading="creating"
            :disabled="creating"
            @click="createCourse"
          >
            Создать курс
          </UButton>
        </div>
      </div>
    </template>
  </ConstructPanels>
</template>
