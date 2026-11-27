<script setup lang="ts">
// Кнопка «Смотреть как» (impersonation).
// Видна только admin. Рисуется как inline-иконка — по размеру и вертикали
// совпадает с соседним элементом, если компонент вставили в строку текста.
// Клик → POST /admin/impersonate/start → новая вкладка с accept.
// См. useImpersonation и ImpersonationController на бэкенде.

const props = withDefaults(defineProps<{
  /** id пользователя, от лица которого открываем просмотр. */
  userId: number
  /** Подпись для aria-label / tooltip. */
  userName?: string | null
}>(), {
  userName: null,
})

const { hasRole } = useAuth()
const { openAs } = useImpersonation()
const toast = useToast()

const isAdmin = computed(() => hasRole('admin'))
const pending = ref(false)

const label = computed(() =>
  props.userName ? `Войти как ${props.userName}` : 'Войти от лица пользователя',
)

async function handleClick(event: MouseEvent) {
  // Не даём клику «провалиться» в соседнюю карточку/ссылку.
  event.preventDefault()
  event.stopPropagation()

  if (pending.value || !props.userId) return

  pending.value = true
  try {
    await openAs(props.userId)
  } catch (e: any) {
    // Если это 422 от бэка (нельзя смотреть как админ / себя) — покажем текст.
    if (e?.status === 422 && e?.data?.message) {
      toast.add({
        title: 'Просмотр невозможен',
        description: e.data.message,
        color: 'warning',
        icon: 'i-lucide-triangle-alert',
      })
    }
    // остальные ошибки уже показаны тостом внутри useApi
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UButton
    v-if="isAdmin"
    type="button"
    color="primary"
    variant="ghost"
    size="xs"
    square
    icon="i-lucide-user-round-check"
    :aria-label="label"
    :title="label"
    :loading="pending"
    class="inline-flex shrink-0 align-middle"
    @click="handleClick"
  />
</template>

<style scoped>

</style>
