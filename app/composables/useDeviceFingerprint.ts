// app/composables/useDeviceFingerprint.ts
import FingerprintJS from '@fingerprintjs/fingerprintjs'

export const useDeviceFingerprint = () => {
  // useState сохраняет ID в памяти Nuxt.
  // Это значит, что если мы запросим ID на странице логина,
  // а потом перейдем в профиль — библиотека не будет загружаться заново.
  const deviceId = useState<string | null>('device-fingerprint', () => null)

  /**
   * Асинхронно получает ID устройства.
   * Если ID уже получен ранее, возвращает его из кеша.
   */
  const getDeviceId = async (): Promise<string | null> => {
    // Если уже есть в кеше — отдаем сразу
    if (deviceId.value) return deviceId.value

    // На сервере (SSR) нет объекта window, поэтому возвращаем null
    if (import.meta.server) return null

    try {
      // Загружаем библиотеку и генерируем отпечаток
      const fp = await FingerprintJS.load()
      const result = await fp.get()

      // Сохраняем в кеш Nuxt и возвращаем
      deviceId.value = result.visitorId
      return deviceId.value
    } catch (error) {
      console.error('[Fingerprint] Ошибка при получении отпечатка:', error)
      return null
    }
  }

  return {
    deviceId,
    getDeviceId
  }
}
