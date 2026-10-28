// app/middleware/auth.global.ts
export default defineNuxtRouteMiddleware(async (to) => {
  if ((to.meta as any).sanctum?.excluded === true) return

  const { user, fetchUser, hasRole, isEmailVerified } = useAuth()

  if (!user.value) {
    await fetchUser().catch(() => {})
  }

  if (!user.value) {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath },
    })
  }

  // === ДОБАВЛЕНА ЗАГРУЗКА ПРОФИЛЯ ===
  // Загружаем профиль пользователя (если он ещё не загружен)
  const { fetchUserData } = useProfile()
  await fetchUserData()
  // ===================================

  const skipVerification =
    to.path === '/verify-email' ||
    (to.meta as any).skipEmailVerification === true

  if (!skipVerification && !isEmailVerified.value) {
    return navigateTo({
      path: '/verify-email',
      query: { redirect: to.fullPath },
    })
  }

  const required = (to.meta as any).roles as string | string[] | undefined
  if (required) {
    const ok = Array.isArray(required)
      ? required.some((r) => hasRole(r))
      : hasRole(required)
    if (!ok) return navigateTo('/forbidden')
  }
})
