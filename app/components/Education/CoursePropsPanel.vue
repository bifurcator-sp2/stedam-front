<!-- app/components/Education/CoursePropsPanel.vue -->
<script setup lang="ts">
import type { CourseListItem } from '~/types/course'
import type { UserListItem } from '~/components/Cabinet/UsersSearch.vue'

interface TaxonomyNode {
  id: number
  parent_id: number | null
  title: string | null
  description: string | null
  children: TaxonomyNode[]
}

const props = withDefaults(defineProps<{
  course: CourseListItem
  taxonomyTree?: TaxonomyNode[]
}>(), {
  taxonomyTree: () => [],
})

const emit = defineEmits<{
  (e: 'open-taxonomy', id: number): void
  (e: 'assign', studentId: number): void
}>()

const api = useApi()
const toast = useToast()

// ==================== Назначение ученикам ====================

const assignOpen = ref(false)
const student = ref<UserListItem | null>(null)
const assigning = ref(false)
const assignedStudentIds = ref<Set<number>>(new Set())

function openAssignModal() {
  student.value = null
  assignOpen.value = true
}

function isAlreadyAssigned(user: UserListItem | null): boolean {
  return !!user && assignedStudentIds.value.has(user.id)
}

async function submitAssign(close: () => void) {
  const user = student.value
  if (!user) return

  assigning.value = true
  try {
    await api.post(
      `/courses/${props.course.id}/assignments`,
      { student_id: user.id },
      { silent: true },
    )
    assignedStudentIds.value.add(user.id)

    toast.add({
      title: 'Курс назначен',
      description: user.full_name || `Ученик #${user.id}`,
      color: 'success',
      icon: 'i-lucide-check',
    })

    emit('assign', user.id)
    close()
  } catch (e: any) {
    // 409 — ученик уже назначен, это штатная ситуация
    if (e?.status === 409 || e?.response?.status === 409) {
      assignedStudentIds.value.add(user.id)
      toast.add({
        title: 'Уже назначено',
        description: 'Этот ученик уже имеет этот курс',
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      })
    } else {
      toast.add({
        title: 'Не удалось назначить курс',
        description: e?.data?.message || e?.message || 'Повторите попытку',
        color: 'error',
        icon: 'i-lucide-circle-x',
      })
    }
  } finally {
    assigning.value = false
  }
}

// ==================== Крошки раздела ====================

function findPath(nodes: TaxonomyNode[], targetId: number): TaxonomyNode[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return [node]
    if (node.children) {
      const path = findPath(node.children, targetId)
      if (path) return [node, ...path]
    }
  }
  return null
}

const taxonomyPath = computed<TaxonomyNode[]>(() => {
  const taxId = props.course.tax_id
  if (!taxId || !props.taxonomyTree.length) return []
  return findPath(props.taxonomyTree, taxId) ?? []
})

// ==================== Отображение ====================

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
</script>

<template>
  <div class="right-panel-content flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
    <div class="flex-1 overflow-y-auto">
      <div class="p-5 flex flex-col gap-4">

        <!-- Заголовок + бейджи -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2 text-[11px] font-mono text-slate-400">
            <span>#{{ course.id }}</span>

            <span
              v-if="course.is_system"
              class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium font-sans bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
            >
              Системный
            </span>

            <span
              class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium font-sans"
              :class="course.published
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'"
            >
              <UIcon :name="course.published ? 'i-lucide-lock' : 'i-lucide-pencil'" class="w-3 h-3" />
              {{ course.published ? 'Опубликован' : 'Черновик' }}
            </span>
          </div>

          <h2 class="text-base font-semibold text-slate-900 dark:text-white break-words">
            {{ course.title?.trim() || 'Без названия' }}
          </h2>

          <p
            class="text-xs leading-relaxed whitespace-pre-line"
            :class="course.description?.trim()
              ? 'text-slate-500 dark:text-slate-400'
              : 'text-slate-400 italic'"
          >
            {{ course.description?.trim() || 'Без описания' }}
          </p>
        </div>

        <!-- Свойства (только то, что есть в элементе списка) -->
        <dl class="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs">
          <div class="flex items-center justify-between gap-3">
            <dt class="inline-flex items-center gap-1.5 text-slate-400">
              <UIcon name="i-lucide-book-open" class="w-3.5 h-3.5" />
              Уроков
            </dt>
            <dd class="font-medium text-slate-700 dark:text-slate-200">{{ course.lessons_count ?? 0 }}</dd>
          </div>

          <div class="flex items-center justify-between gap-3">
            <dt class="inline-flex items-center gap-1.5 text-slate-400">
              <UIcon name="i-lucide-languages" class="w-3.5 h-3.5" />
              Язык
            </dt>
            <dd class="font-medium text-slate-700 dark:text-slate-200 uppercase">{{ course.locale || '—' }}</dd>
          </div>

          <div class="flex items-center justify-between gap-3">
            <dt class="inline-flex items-center gap-1.5 shrink-0 text-slate-400">
              <UIcon name="i-lucide-folder-tree" class="w-3.5 h-3.5" />
              Раздел
            </dt>
            <dd class="min-w-0 text-right">
              <span v-if="taxonomyPath.length === 0" class="font-medium text-slate-700 dark:text-slate-200">—</span>
              <ol v-else class="inline-flex flex-wrap items-center justify-end gap-x-0.5 text-[11px] leading-tight">
                <li
                  v-for="(node, i) in taxonomyPath"
                  :key="node.id"
                  class="inline-flex items-center gap-0.5"
                >
                  <button
                    type="button"
                    class="max-w-[12rem] truncate rounded px-0.5 hover:text-[var(--ui-primary,#3b82f6)] hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ui-primary,#3b82f6)]"
                    :class="i === taxonomyPath.length - 1
                      ? 'font-medium text-slate-700 dark:text-slate-200'
                      : 'text-slate-500 dark:text-slate-400'"
                    :title="node.title || undefined"
                    @click="emit('open-taxonomy', node.id)"
                  >
                    {{ node.title || '—' }}
                  </button>
                  <UIcon
                    v-if="i < taxonomyPath.length - 1"
                    name="i-lucide-chevron-right"
                    class="w-3 h-3 shrink-0 opacity-50"
                  />
                </li>
              </ol>
            </dd>
          </div>

          <div class="flex items-center justify-between gap-3">
            <dt class="inline-flex items-center gap-1.5 text-slate-400">
              <UIcon name="i-lucide-calendar" class="w-3.5 h-3.5" />
              Обновлён
            </dt>
            <dd class="font-medium text-slate-700 dark:text-slate-200">{{ formatDate(course.updated_at) }}</dd>
          </div>
        </dl>

        <!-- Действия -->
        <UButton
          icon="i-lucide-user-plus"
          block
          color="primary"
          variant="solid"
          label="Назначить курс ученикам"
          @click="openAssignModal"
        />
      </div>
    </div>

    <!-- Модалка назначения курса ученику -->
    <UModal
      v-model:open="assignOpen"
      title="Назначить курс ученикам"
      :description="course.title || undefined"
    >
      <template #body>
        <CabinetUsersSearch v-model="student" :roles="['student']" />

        <p
          v-if="isAlreadyAssigned(student)"
          class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        >
          Этот ученик уже назначен на курс
        </p>
      </template>

      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Отмена" @click="close" />
          <UButton
            label="Назначить"
            :disabled="!student || isAlreadyAssigned(student)"
            :loading="assigning"
            @click="submitAssign(close)"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
