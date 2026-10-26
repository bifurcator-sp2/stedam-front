// app/plugins/device-header.client.ts
export default defineNuxtPlugin(() => {
  const { getDeviceId } = useDeviceFingerprint()

  // Сохраняем оригинальный $fetch
  const originalFetch = globalThis.$fetch

  // Создаем обертку, которая внедряет заголовок
  globalThis.$fetch = originalFetch.create({
    async onRequest({ options }) {
      const id = await getDeviceId()
      if (id) {
        options.headers = {
          ...options.headers,
          'X-Device-Id': id,
        } as HeadersInit
      }
    },
  })
})
