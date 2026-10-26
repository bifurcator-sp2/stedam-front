<script setup lang="ts">
const { t } = useI18n()
const { user } = useSanctumAuth()
const { publicRoles, setActiveRole, getActiveRole } = useActiveRole()

const currentActiveRole = ref(getActiveRole())

// Используем публичные роли напрямую, там уже есть name и label
const avatarRoleLinks = computed(() => publicRoles.value)

const open = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)

const menuStyle = ref<Record<string, string>>({
  position: 'fixed',
  top: '0px',
  left: '0px',
  visibility: 'hidden',
})

const MENU_WIDTH = 224
const GAP = 8
const MARGIN = 8

function updatePosition() {
  if (!triggerRef.value || !menuRef.value) return
  const trigger = triggerRef.value.getBoundingClientRect()
  const menuHeight = menuRef.value.offsetHeight
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight

  let left = trigger.right - MENU_WIDTH
  if (left < MARGIN) left = MARGIN
  if (left + MENU_WIDTH > viewportW - MARGIN) left = viewportW - MENU_WIDTH - MARGIN

  let top = trigger.bottom + GAP
  if (top + menuHeight > viewportH - MARGIN) top = trigger.top - menuHeight - GAP
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
  if (open.value) nextTick(updatePosition)
}

function close() { open.value = false }

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
  return name.split(' ').filter(Boolean).slice(0, 2).map((p: string) => p[0]?.toUpperCase() ?? '').join('')
})
const router = useRouter()
function handleRoleClick(roleName: string) {
  if (roleName === currentActiveRole.value) return
  close()
  setActiveRole(roleName)
  // Принудительный переход на главную с полной перезагрузкой,
  // чтобы сбросить всё состояние и применить новую роль
  window.location.assign(router.resolve('/').href)
}
</script>

<template>
  <div class="relative inline-block">
    <button
      ref="triggerRef"
      type="button"
      class="flex items-center justify-center w-10 h-10 rounded-full overflow-hidden bg-primary-100 text-primary-700 font-medium ring-2 ring-transparent hover:ring-primary-400 transition"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="toggle"
    >
      <img v-if="user?.avatar" :src="user.avatar" :alt="user?.name" class="w-full h-full object-cover" />
      <span v-else class="text-sm">{{ initials || '?' }}</span>
    </button>

    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-1"
      >
        <div v-if="open" ref="menuRef" class="w-56 z-[9999]" :style="menuStyle">
          <div class="rounded-lg border border-default bg-default shadow-lg overflow-hidden">

            <!-- Список публичных ролей -->
            <div v-if="avatarRoleLinks.length > 0" class="py-1">
              <button
                v-for="role in avatarRoleLinks"
                :key="role.name"
                type="button"
                class="block w-full text-left px-4 py-2 text-sm transition"
                :class="[
                  currentActiveRole === role.name
                    ? 'font-semibold text-primary cursor-default'
                    : 'text-default hover:bg-elevated cursor-pointer'
                ]"
                @click="handleRoleClick(role.name)"
              >
                {{ role.label }}
              </button>
            </div>

            <div class="border-t border-default"></div>
            <div class="py-1">
              <NuxtLink to="/profile" class="block px-4 py-2 text-sm text-default hover:bg-elevated transition" @click="close">
                {{ user?.email }}
              </NuxtLink>
            </div>
            <div class="border-t border-default"></div>
            <div class="flex items-stretch divide-x divide-default">
              <UColorModeButton class="flex-1 justify-center h-10 rounded-none hover:bg-elevated" />
              <LocaleSwitcher class="flex-1 justify-center h-10 rounded-none hover:bg-elevated" />
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
