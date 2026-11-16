// app/middleware/routes_access.global.ts

// ==================== Карта доступа к маршрутам ====================
// Ключ — путь, значение — роли, которым страница доступна.
// Любая роль из списка даёт доступ.

const ROUTE_ACCESS: Record<string, string[]> = {
  // Страницы конструктора курсов — только учителю
  '/make-course': ['teacher'],
  '/construct-course': ['teacher'],

  // Пример «хотя бы одна из ролей»
  '/make-test': ['teacher', 'admin'],
  '/construct-lesson': ['teacher', 'admin'],
}

export default defineNuxtRouteMiddleware((to) => {
  // auth.global.ts уже загружает user — здесь только проверка ролей
  const { user, hasAnyRole } = useAuth()

  // Не авторизован — этим занимается auth.global.ts
  if (!user.value) return

  const allowedRoles = ROUTE_ACCESS[to.path]
  if (!allowedRoles) return

  if (!hasAnyRole(allowedRoles)) {
    // Встроенная страница ошибки Nuxt (error.vue) с кодом 403
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
})
