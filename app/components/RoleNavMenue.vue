<script setup lang="ts">
import { computed, watch } from 'vue'

const { t, locale } = useI18n()
const route = useRoute()

const props = defineProps<{
  isIcons: boolean
  isExpanded: boolean
}>()

interface NavItem {
  label: string
  icon: string
  to: string
  isSystem?: boolean
}

const { roles, allRoles } = useAuth()
const { getActiveRole } = useActiveRole()

// ✅ Реактивный activeRole — иначе при смене роли / загрузке данных
// navItems не пересчитается, и watcher ниже не сработает корректно
const activeRole = computed(() => getActiveRole())

const navItemsShared: NavItem[] = [
  { label: 'Профиль', icon: 'i-lucide-circle-user', to: '/profile' },
  { label: t('privacy.title'), icon: 'i-lucide-cookie', to: '/privacy' },
]

const navItemsByRoles: Record<string, NavItem[]> = {
  admin: [
    { label: 'Конструктор блоков', icon: 'i-lucide-blocks', to: '/construct' },
  ],
  student: [
    { label: 'Текущее занятие', icon: 'i-lucide-circle-play', to: '/learn/select-lesson' },
    { label: 'Программы обучения', icon: 'i-lucide-graduation-cap', to: '/learn' },
    { label: 'Пройденый материал', icon: 'i-lucide-book-check', to: '/learned' },
  ],
  teacher: [
    { label: 'Я - преподаватель', icon: 'i-lucide-presentation', to: '/edu' },
  ],
  parent: [
    { label: 'Я - родитель', icon: 'i-lucide-users', to: '/parent' },
  ],
  methodologist: [
    { label: 'Я - методист', icon: 'i-lucide-book-open', to: '/methodist' },
  ],
}

const navItems = computed<NavItem[]>(() => {
  const items: NavItem[] = []
  const addedRoles = new Set<string>()

  // 1. Активная роль
  const current = activeRole.value
  if (current && navItemsByRoles[current]) {
    items.push(...navItemsByRoles[current])
    addedRoles.add(current)
  }

  // 2. Системные роли (все роли минус публичные)
  const publicRoleNames = (allRoles.value ?? []).map(r => r.name)
  const systemRoles = (roles.value ?? []).filter(r => !publicRoleNames.includes(r))

  systemRoles.forEach((roleName) => {
    if (!addedRoles.has(roleName) && navItemsByRoles[roleName]) {
      items.push(
        ...navItemsByRoles[roleName].map(item => ({ ...item, isSystem: true })),
      )
      addedRoles.add(roleName)
    }
  })

  // 3. Общие пункты
  items.push(...navItemsShared)

  return items
})

// 🚀 Редирект с корня приложения (baseURL) на первую страницу из navItems
watch(
  navItems,
  (items) => {
    // Нас интересует только корень приложения: с baseURL='/app/'
    // useRoute().path для главной страницы возвращает '/'
    if (route.path !== '/' || items.length === 0) return

    // Пропускаем общие пункты (Профиль/Приватность) — редиректим
    // на первый «ролевой» пункт. Иначе при ещё не загруженных roles
    // пользователя выкинет на /profile.
    const sharedPaths = new Set(navItemsShared.map(i => i.to))
    const firstRoleItem = items.find(i => !sharedPaths.has(i.to))

    if (!firstRoleItem) return

    navigateTo(firstRoleItem.to, { replace: true })
  },
  { immediate: true },
)
</script>


<template>
  <ul class="space-y-1 px-2">
    <li v-for="item in navItems" :key="item.to">
      <NuxtLink
        :to="item.to"
        class="flex items-center gap-3 px-3 py-2 rounded-md text-sm
               text-default hover:bg-elevated transition-colors"
        :class="isIcons ? 'justify-center' : ''"
        :title="isIcons ? item.label : undefined"
      >
        <!-- Основная иконка -->
        <UIcon :name="item.icon" class="w-5 h-5 shrink-0" />

        <!-- Текст и замочек (показываем только если меню развернуто) -->
        <template v-if="isExpanded">
          <span class="truncate flex-1">{{ item.label }}</span>

          <!-- Иконка замочка для системных ролей -->
          <UIcon
            v-if="item.isSystem"
            name="i-lucide-lock"
            class="w-3.5 h-3.5 text-muted shrink-0"
            title="Системная роль"
          />
        </template>
      </NuxtLink>
    </li>
  </ul>
</template>
