// app/middleware/auth.ts
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchUser, hasRole } = useAuth()

  if (!user.value) {
    await fetchUser()
  }

  if (!user.value) {
    return navigateTo('/login')
  }

  const required = to.meta.roles as string | string[] | undefined
  if (required) {
    const ok = Array.isArray(required)
      ? required.some((r) => hasRole(r))
      : hasRole(required)
    if (!ok) return navigateTo('/forbidden')
  }
})
