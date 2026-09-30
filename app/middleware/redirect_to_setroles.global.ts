// app/middleware/setroles.global.ts

export default defineNuxtRouteMiddleware((to) => {
  const { user, roles } = useAuth()

  // Не авторизован — middleware не наше дело
  if (!user.value) return

  // Уже на /setroles — не редиректим на себя
  if (to.path === '/setroles') return

  // Страницы, доступные без ролей
  const allowedWithoutRoles = ['/logout', '/profile']
  if (allowedWithoutRoles.includes(to.path)) return

  // Если ролей нет — принудительно на /setroles
  if (roles.value.length === 0) {
    return navigateTo('/setroles')
  }
})
