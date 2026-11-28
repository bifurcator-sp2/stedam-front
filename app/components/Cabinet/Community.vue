<script setup lang="ts">
import DOMPurify from 'isomorphic-dompurify'
import type { AccordionItem } from '@nuxt/ui'

interface MyRelation {
  relation: string
  direction: 'incoming' | 'outgoing'
  role: string
  label: string
  description: string
  count: number
  available: boolean
  counterpart_role: string
}

interface RelationAccordionItem extends AccordionItem {
  /** Очищенный html-описание (безопасно вставлять через v-html). */
  safeDescription: string
  /** Связь — для запроса пользователей в UsersSearch. */
  relation: string
  /** Роль второй стороны связи — для UsersSearch. */
  counterpartRole: string
  /** Можно ли управлять этой связью (иначе поиск не показываем). */
  available: boolean
}

const api = useApi()

const { data: relations, pending, error } = await useAsyncData('my-relations', () =>
  api.get<{ data: MyRelation[] }>('/my-relations'),
)

// Открытый элемент аккордеона. При каждом открытии (ключ меняется) UsersSearch
// монтируется заново и сразу тянет первую страницу списка.
const openItem = ref<string>()
// Счётчик открытий: заставляет Vue пересоздать UsersSearch, даже если
// пользователь закрыл и снова открыл тот же блок.
const openSeq = ref(0)
watch(openItem, (val) => {
  if (val) openSeq.value++
})

const items = computed<RelationAccordionItem[]>(() => {
  const list = relations.value?.data ?? []
  return list.map((item, index) => ({
    key: `${item.relation}-${item.direction}-${index}`,
    label: item.label,
    count: item.count,
    safeDescription: DOMPurify.sanitize(item.description),
    relation: item.relation,
    counterpartRole: item.counterpart_role,
    available: item.available,
  }))
})
</script>

<template>
  <!-- Ограничение ширины для планшета в портретной ориентации -->
  <div class="mx-auto w-full max-w-md">
    <div v-if="pending">Загрузка...</div>
    <div v-else-if="error">Ошибка загрузки</div>
    <UAccordion
      v-else
      v-model="openItem"
      :items="items"
      :ui="{ item: 'bg-white rounded-lg mb-2', trigger: 'text-left', body: 'pb-4 px-3' }"
    >
      <template #default="{ item }">
        <!-- Иконка + label (label тянется во всю ширину), count прижат к правому краю label,
             следом UAccordion рендерит стрелку через ms-auto -->
        <span class="flex min-w-0 flex-1 items-center gap-2">
          <UIcon name="i-lucide-users" class="size-5 shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
          <span class="shrink-0 font-semibold">{{ item.count }}</span>
        </span>
      </template>

      <template #content="{ item }">
        <div class="text-xs" v-html="item.safeDescription" />

        <CabinetUsersSearch
          v-if="item.available && item.count > 0"
          :id="`users-search-${item.key}`"
          :key="`${item.key}-${openSeq}`"
          class="mt-3"
          mode="list"
          auto-load
          :relation="item.relation"
          :counterpart-role="item.counterpartRole"
        />
      </template>
    </UAccordion>
  </div>
</template>

<style scoped>

</style>
