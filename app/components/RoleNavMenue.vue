<script setup lang="ts">
import { computed } from 'vue'
const { t, locale } = useI18n()

const props = defineProps<{
  isIcons: boolean
  isExpanded: boolean
}>()

interface NavItem {
  label: string
  icon: string
  to: string
  isSystem?: boolean // Добавили флаг для системных ролей
}

// Получаем все роли пользователя (roles) и публичные роли (allRoles)
const { roles, allRoles } = useAuth()
// Получаем активную роль
const { getActiveRole } = useActiveRole()

const activeRole = getActiveRole()

// Общие пункты меню
const navItemsShared: NavItem[] = [
  { label: 'Профиль', icon: 'i-lucide-circle-user', to: '/profile' },
  { label: t('privacy.title'), icon: 'i-lucide-cookie', to: '/privacy' },
]

// Пункты меню для каждой роли
const navItemsByRoles: Record<string, NavItem[]> = {
  admin: [
    { label: 'Конструктор блоков', icon: 'i-lucide-blocks', to: '/construct' },
  ],
  student: [
    { label: 'Я - ученик', icon: 'i-lucide-graduation-cap', to: '/learn' },
  ],
  teacher: [
    { label: 'Я - преподаватель', icon: 'i-lucide-presentation', to: '/edu' },
  ],
  parent: [
    { label: 'Я - родитель', icon: 'i-lucide-users', to: '/parent' },
  ],
  methodologist: [
    { label: 'Я - методист', icon: 'i-lucide-book-open', to: '/methodist' },
  ]
}

const navItems = computed<NavItem[]>(() => {
  const items: NavItem[] = []
  const addedRoles = new Set<string>()

  // 1. Добавляем пункты активной роли
  if (activeRole && navItemsByRoles[activeRole]) {
    items.push(...navItemsByRoles[activeRole])
    addedRoles.add(activeRole)
  }

  // 2. Вычисляем разницу: (все роли) минус (публичные роли)
  // Это будут системные роли (например, 'admin')
  const publicRoleNames = (allRoles.value ?? []).map(r => r.name)
  const systemRoles = (roles.value ?? []).filter(r => !publicRoleNames.includes(r))

  // Добавляем пункты для системных ролей
  systemRoles.forEach(roleName => {
    if (!addedRoles.has(roleName) && navItemsByRoles[roleName]) {
      // Пометим эти пункты как системные
      const systemItems = navItemsByRoles[roleName].map(item => ({
        ...item,
        isSystem: true
      }))
      items.push(...systemItems)
      addedRoles.add(roleName)
    }
  })

  // 3. Добавляем общие пункты в конец
  items.push(...navItemsShared)

  return items
})
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
