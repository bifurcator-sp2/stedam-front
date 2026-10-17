// app/composables/useImageListActions.ts
import { toRaw } from 'vue'
import type { ImageItem } from '~/types/files'

interface FileContainerLike {
  removeFile: (item: ImageItem) => void
  restoreFile: (item: ImageItem) => void
}

interface Options {
  /** Ref на массив картинок — используется когда нет FileContainer */
  imagesRef?: { value: ImageItem[] }
  /** Ref на FileContainer — если он есть */
  containerRef?: { value: FileContainerLike | null }
}

/**
 * Универсальный набор действий с изображениями.
 *
 * Если containerRef доступен — делегирует removeFile/restoreFile в него.
 * Иначе — мутирует imagesRef.value: помечает toDelete или удаляет.
 */
export function useImageListActions(options: Options) {
  function remove(item: ImageItem) {
    const container = options.containerRef?.value
    if (container) {
      container.removeFile(item)
      return
    }

    const list = options.imagesRef?.value
    if (!list) return

    const idx = list.findIndex((i) => i.url === item.url)
    if (idx < 0) return

    // Мягкое удаление: помечаем toDelete, чтобы родитель мог решить,
    // удалять ли физически. Для text_image — это просто фильтр.
    const next = list.slice()
    next[idx] = { ...next[idx], toDelete: true }
    options.imagesRef!.value = next
  }

  function restore(item: ImageItem) {
    const container = options.containerRef?.value
    if (container) {
      container.restoreFile(item)
      return
    }

    const list = options.imagesRef?.value
    if (!list) return

    const idx = list.findIndex((i) => i.url === item.url)
    if (idx < 0) return

    const next = list.slice()
    next[idx] = { ...next[idx], toDelete: false }
    options.imagesRef!.value = next
  }

  return { remove, restore }
}
