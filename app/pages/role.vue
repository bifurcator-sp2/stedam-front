<script setup lang="ts">

definePageMeta({
  layout: 'login',
})

const title = 'Профиль'
const description = 'Stedam'

useSeoMeta({
  titleTemplate: '',
  title,
  ogTitle: title,
  description,
  ogDescription: description,
  ogImage: 'https://ui.nuxt.com/assets/templates/nuxt/saas-light.png',
})

// Состояние свёрнутого сайдбара
const collapsed = ref(false)

interface NavItem {
  label: string
  icon: string
  to: string
}

const navItems: NavItem[] = [
  { label: 'Дашборд', icon: 'i-lucide-layout-dashboard', to: '/dashboard' },
  { label: 'Профиль', icon: 'i-lucide-user', to: '/profile' },
  { label: 'Роли', icon: 'i-lucide-shield', to: '/roles' },
  { label: 'Пользователи', icon: 'i-lucide-users', to: '/users' },
  { label: 'Страны', icon: 'i-lucide-globe', to: '/countries' },
  { label: 'Настройки', icon: 'i-lucide-settings', to: '/settings' },
]
</script>

<template>
  <div class="flex min-h-screen bg-elevated/30">
    <!-- Сайдбар -->
    <aside
      class="sticky top-0 h-screen flex flex-col border-r border-default bg-default
             transition-[width] duration-200 ease-in-out"
      :class="collapsed ? 'w-16' : 'w-64'"
    >
      <!-- Логотип + кнопка сворачивания -->
      <div class="flex items-center h-16 px-3 border-b border-default">
        <NuxtLink
          to="/"
          class="flex items-center gap-2 overflow-hidden flex-1 min-w-0"
        >
          <AppLogoImage class="w-auto h-18 shrink-0" />
        </NuxtLink>

        <UButton
          :icon="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
          color="neutral"
          variant="ghost"
          size="sm"
          class="shrink-0"
          :aria-label="collapsed ? 'Развернуть меню' : 'Свернуть меню'"
          @click="collapsed = !collapsed"
        />
      </div>

      <!-- Навигация -->
      <nav class="flex-1 overflow-y-auto py-2">
        <ul class="space-y-1 px-2">
          <li v-for="item in navItems" :key="item.to">
            <NuxtLink
              :to="item.to"
              class="flex items-center gap-3 px-3 py-2 rounded-md text-sm
                     text-default hover:bg-elevated transition-colors"
              :class="collapsed ? 'justify-center' : ''"
              :title="collapsed ? item.label : undefined"
            >
              <UIcon :name="item.icon" class="w-5 h-5 shrink-0" />
              <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <!-- Футер сайдбара -->
      <div class="border-t border-default p-2">

      </div>
    </aside>

    <!-- Контент -->
    <main class="flex-1 min-w-0">
      <!-- Хедер -->
      <header
        class="sticky top-0 z-10 h-16 px-6 flex items-center justify-between
               bg-default/80 backdrop-blur border-b border-default"
      >
        <h1 class="text-lg font-semibold text-highlighted">Профиль</h1>
        <div class="flex items-center gap-2">
          <UserAvatarMenu />
        </div>
      </header>

      <!-- Тело страницы -->
      <div class="p-6">
        <div class="max-w-3xl mx-auto">

        </div>
      </div>
    </main>
  </div>
</template>
