<script setup lang="ts">
import UserDataForm from '~/components/UserDataForm.vue'
import AppLogoImage from '~/components/AppLogoImage.vue'
import UserAvatarMenu from '~/components/UserAvatarMenu.vue'

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

const { direction } = useAuth()

// Состояние сайдбара: 'expanded' | 'icons' | 'hidden'
type SidebarState = 'expanded' | 'icons' | 'hidden'
const sidebarState = ref<SidebarState>('expanded')

// Порядок переключений по кругу
const stateOrder: SidebarState[] = ['expanded', 'icons', 'hidden']

function toggleSidebar() {
  const currentIndex = stateOrder.indexOf(sidebarState.value)
  const nextIndex = (currentIndex + 1) % stateOrder.length
  sidebarState.value = stateOrder[nextIndex]
}

// Производные флаги
const isExpanded = computed(() => sidebarState.value === 'expanded')
const isIcons = computed(() => sidebarState.value === 'icons')
const isHidden = computed(() => sidebarState.value === 'hidden')

// Сторона сайдбара
const sidebarSide = computed<'left' | 'right'>(() =>
  direction.value === 'rtl' ? 'right' : 'left'
)

// Ширина
const sidebarWidth = computed(() => {
  if (isExpanded.value) return 'w-64'
  if (isIcons.value) return 'w-16'
  return 'w-0'
})

interface NavItem {
  label: string
  icon: string
  to: string
}

const navItems: NavItem[] = [
  { label: 'Профиль', icon: 'i-lucide-user', to: '/profile' },
]




const blocks = ref<any[]>([])
</script>

<template>
  <div
    class="flex min-h-screen bg-elevated/30"
    :class="sidebarSide === 'right' ? 'flex-row-reverse' : ''"
  >
    <!-- Сайдбар -->
    <aside
      class="sticky top-0 h-screen flex flex-col bg-default overflow-hidden
             transition-[width] duration-200 ease-in-out"
      :class="[
        sidebarWidth,
        isHidden ? 'border-none' : sidebarSide === 'left' ? 'border-r' : 'border-l',
        'border-default',
      ]"
    >
      <!-- Логотип -->
      <div class="flex items-center h-16 px-3 border-b border-default gap-1">


        <NuxtLink
          to="/"
          class="flex items-center gap-2 overflow-hidden flex-1 min-w-0"
        >
          <AppLogoImage
            v-if="isExpanded"
            class="w-auto h-18 shrink-0"
          />
          <UIcon
            v-else
            name="i-lucide-box"
            class="w-6 h-6 text-primary shrink-0 mx-auto"
          />
        </NuxtLink>


      </div>

      <!-- Навигация -->
      <nav class="flex-1 overflow-y-auto py-2">
        <ul class="space-y-1 px-2">
          <li v-for="item in navItems" :key="item.to">
            <NuxtLink
              :to="item.to"
              class="flex items-center gap-3 px-3 py-2 rounded-md text-sm
                     text-default hover:bg-elevated transition-colors"
              :class="isIcons ? 'justify-center' : ''"
              :title="isIcons ? item.label : undefined"
            >
              <UIcon :name="item.icon" class="w-5 h-5 shrink-0" />
              <span v-if="isExpanded" class="truncate">{{ item.label }}</span>
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <div class="border-t border-default p-2"></div>
    </aside>

    <!-- Контент -->
    <main class="flex-1 min-w-0">
      <header
        class="sticky top-0 z-10 h-16 px-6 flex items-center justify-between
               bg-default/80 backdrop-blur border-b border-default"
      >
        <template v-if="sidebarSide === 'left'">
            <!-- Кликабельный заголовок -->
            <button
              type="button"
              class="text-lg font-semibold text-highlighted
                     hover:text-primary transition-colors cursor-pointer
                     flex items-center gap-2"
              :aria-label="`Сайдбар: ${sidebarState}`"
              @click="toggleSidebar"
            >
              <UIcon
                :name="
                  isExpanded
                    ? 'i-lucide-panel-left-close'
                    : isIcons
                      ? 'i-lucide-panel-left'
                      : 'i-lucide-panel-left-open'
                "
                class="w-5 h-5"
              />
              <span>Дашборд пользователя</span>
            </button>

            <div class="flex items-center gap-2">
              <UserAvatarMenu />
            </div>
        </template>

        <template v-else>
          <UserAvatarMenu />

          <div class="flex items-center gap-2">
            <!-- Кликабельный заголовок -->
            <button
              type="button"
              class="text-lg font-semibold text-highlighted
                     hover:text-primary transition-colors cursor-pointer
                     flex items-center gap-2"
              :aria-label="`Сайдбар: ${sidebarState}`"
              @click="toggleSidebar"
            >
              <span>Дашборд пользователя</span>
              <UIcon
                :name="
                  isExpanded
                    ? 'i-lucide-panel-left-close'
                    : isIcons
                      ? 'i-lucide-panel-left'
                      : 'i-lucide-panel-left-open'
                "
                class="w-5 h-5"
              />

            </button>
          </div>

        </template>

      </header>

      <div class="p-6">
        <div>
          тут дашборд пользователя общий

            <ConstructorPalette v-model="blocks" />
            <!-- Отладка: посмотреть структуру -->
            <pre class="mt-4 text-xs">{{ blocks }}</pre>

        </div>
      </div>
    </main>
  </div>
</template>
