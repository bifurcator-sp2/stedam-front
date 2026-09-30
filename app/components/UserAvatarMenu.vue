<script setup lang="ts">
const { t } = useI18n()
const { user } = useSanctumAuth()
const { roles, allRoles } = useAuth()

const open = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)

// Позиция меню в координатах viewport
const menuStyle = ref<Record<string, string>>({
  position: 'fixed',
  top: '0px',
  left: '0px',
  visibility: 'hidden',
})

const MENU_WIDTH = 224   // w-56 = 14rem = 224px
const GAP = 8            // отступ между кнопкой и меню
const MARGIN = 8         // минимальный отступ от края экрана

function updatePosition() {
  if (!triggerRef.value || !menuRef.value) return

  const trigger = triggerRef.value.getBoundingClientRect()
  const menuHeight = menuRef.value.offsetHeight
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight

  // Горизонталь: по умолчанию выравниваем правый край меню с правым краем кнопки
  let left = trigger.right - MENU_WIDTH

  // Если вылезает за левый край — прижимаем к левому
  if (left < MARGIN) left = MARGIN

  // Если вылезает за правый край — прижимаем к правому
  if (left + MENU_WIDTH > viewportW - MARGIN) {
    left = viewportW - MENU_WIDTH - MARGIN
  }

  // Вертикаль: по умолчанию вниз от кнопки
  let top = trigger.bottom + GAP

  // Если меню не помещается снизу — показываем сверху
  if (top + menuHeight > viewportH - MARGIN) {
    top = trigger.top - menuHeight - GAP
  }

  // Если и сверху не помещается — прижимаем к верху
  if (top < MARGIN) top = MARGIN

  menuStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    visibility: 'visible',
  }
}

function toggle() {
  open.value = !open.value
  if (open.value) {
    nextTick(updatePosition)
  }
}

function close() {
  open.value = false
}

function onClickOutside(e: MouseEvent) {
  if (!open.value) return
  const target = e.target as Node
  if (triggerRef.value?.contains(target)) return
  if (menuRef.value?.contains(target)) return
  close()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

function onScrollOrResize() {
  if (open.value) updatePosition()
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize)
})

const initials = computed(() => {
  const name = user.value?.name ?? ''
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase() ?? '')
    .join('')
})

const roleLinks = computed(() =>
  allRoles.value.map((role) => ({
    label: role.label ?? role.name,
    to: `/${role.name}`,
  })),
)
</script>

<template>
  <div class="relative inline-block">
    <!-- Триггер -->
    <button
      ref="triggerRef"
      type="button"
      class="flex items-center justify-center w-10 h-10 rounded-full overflow-hidden
             bg-primary-100 text-primary-700 font-medium
             ring-2 ring-transparent hover:ring-primary-400 transition"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="toggle"
    >
      <img
        v-if="user?.avatar"
        :src="user.avatar"
        :alt="user?.name"
        class="w-full h-full object-cover"
      />
      <span v-else class="text-sm">
        {{ initials || '?' }}
      </span>
    </button>

    <!-- Меню через Teleport -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-1"
      >
        <div
          v-if="open"
          ref="menuRef"
          class="w-56 z-[9999]"
          :style="menuStyle"
        >
          <div
            class="rounded-lg border border-default bg-default shadow-lg overflow-hidden"
          >
            <div class="py-1">
              <NuxtLink
                v-for="role in roleLinks"
                :key="role.to"
                :to="role.to"
                class="block px-4 py-2 text-sm text-default hover:bg-elevated transition"
                @click="close"
              >
                {{ role.label }}
              </NuxtLink>
            </div>

            <div class="border-t border-default"></div>

            <div class="py-1">
              <NuxtLink
                to="/profile"
                class="block px-4 py-2 text-sm text-default hover:bg-elevated transition"
                @click="close"
              >
                {{ t('profile.title') }}
              </NuxtLink>
            </div>

            <div class="border-t border-default"></div>

            <div class="flex items-stretch divide-x divide-default">
              <UColorModeButton
                class="flex-1 justify-center h-10 rounded-none hover:bg-elevated"
              />
              <LocaleSwitcher
                class="flex-1 justify-center h-10 rounded-none hover:bg-elevated"
              />
            </div>

            <div class="border-t border-default"></div>

            <div class="px-3 py-2">
              <LogoutButton size="sm" class="w-full" />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
