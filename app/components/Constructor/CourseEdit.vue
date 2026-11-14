<script setup lang="ts">
import ConstructPanels from '~/components/Constructor/ConstructPanels.vue'

const props = defineProps<{
  courseId: number
}>()

const api = useApi()

// ==================== Курс ====================

const { data: course, pending: coursePending } = await useAsyncData(
  () => `course-${props.courseId}`,
  async () => {
    const res = await api.get<{ data?: { id: number, title: string, tax_id: number | null } }>(
      `/courses/${props.courseId}`,
      { silent: true }
    )
    return (res as any)?.data ?? res
  },
  { watch: [() => props.courseId] }
)

const courseTaxId = computed<number | null>(() => course.value?.tax_id ?? null)

const centerTitle = computed(() =>
  course.value?.title ? `Курс №${props.courseId}: ${course.value.title}` : `Курс №${props.courseId}`
)
</script>

<template>
  <ConstructPanels
    left-title="Уроки"
    :main-title="centerTitle"
    :display-right="false"
    :minLeftWidth="250"
    :maxLeftWidth="600"
    :defaultLeftWidth="350"
  >
    <template #left>
      <EducationLessonsSearch
        v-if="!coursePending"
        :selected-taxonomy-id="courseTaxId"
      />
    </template>

    <template #main>
      <div class="mx-auto w-full max-w-[834px] px-6 py-8">
        <div class="rounded-xl border border-default bg-default p-6">
          <h2 class="text-base font-bold text-highlighted">
            Редактирование курса
          </h2>
          <p class="mt-1 text-xs text-muted">
            Курс #{{ props.courseId }}
          </p>
        </div>
      </div>
    </template>
  </ConstructPanels>
</template>
