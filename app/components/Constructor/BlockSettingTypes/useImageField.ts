// app/components/Constructor/BlockSettingTypes/useImageField.ts
// Состояние и вычисления для поля типа `image` (загрузка файлов через FileContainer).

import { computed, ref, toRaw, watch, type Ref } from 'vue'
import type { FilesListResponse, ImageItem } from '~/types/files'

interface ImageFieldNode {
  key?: string
  default?: any
  purpose?: string
  allowed?: any[]
  params?: any
}

function makeEmptyFiles(): FilesListResponse {
  return {
    images: [], files: [], temp: { images: [], files: [] }, stored: { images: [], files: [] },
  }
}

export function useImageField(options: {
  model: Ref<ImageFieldNode>
  updateDefault: (val: any) => void
  resolvePath: (root: any, path: string) => any
  settings?: any
  path?: string
  propMaxImages?: number | null
  resolvedModelName: Ref<string>
}) {
  const { model, updateDefault, resolvePath, settings, path, propMaxImages, resolvedModelName } = options

  const imageFiles = ref<FilesListResponse>(makeEmptyFiles())
  const fileContainerRef = ref<any>(null)

  const imagePurpose = computed<string | null>(() => {
    const params = model.value.params as Record<string, any> | undefined
    const fromParams = params?.purpose
    if (typeof fromParams === 'string' && fromParams) return fromParams
    if (typeof model.value.purpose === 'string' && model.value.purpose) return model.value.purpose
    const first = model.value.allowed?.[0]
    if (typeof first === 'string' && first) return first
    // Без purpose бэк не отдаст файлы — используем стабильный ключ узла.
    return model.value.key || null
  })

  const dynamicResolvers: Record<string, (params: any, settings: any, path: string) => number | null> = {
    'parent.count': (_, s, p) => {
      if (!p) return null
      const parts = p.split('.')
      parts.pop()
      parts.push('count')
      const num = Number(resolvePath(s, parts.join('.')))
      return Number.isFinite(num) ? num : null
    },
  }

  const resolvedCount = computed<number | null>(() => {
    const params = (Array.isArray(model.value.params) ? undefined : model.value.params) as Record<string, any> | undefined
    const raw = params?.count
    if (raw == null) return null

    if (typeof raw === 'number') {
      return Number.isFinite(raw) ? raw : null
    }

    if (typeof raw === 'string') {
      const resolver = dynamicResolvers[raw]
      if (resolver) {
        return resolver(params, settings, path ?? '')
      }
      const num = Number(resolvePath(settings, raw))
      return Number.isFinite(num) ? num : null
    }

    return null
  })

  const displayImages = computed<boolean>(() => {
    const params = model.value.params as Record<string, any> | undefined
    const raw = params?.['display-images']
    if (raw == null) return true
    if (typeof raw === 'boolean') return raw
    if (typeof raw === 'string') {
      const val = resolvePath(settings, raw)
      if (val == null) return true
      if (typeof val === 'string') {
        const s = val.trim().toLowerCase()
        return !(s === '' || s === 'false' || s === '0' || s === 'no')
      }
      return Boolean(val)
    }
    return Boolean(raw)
  })

  const maxImages = computed<number>(() => {
    const params = Array.isArray(model.value.params) ? undefined : model.value.params
    if (params?.count != null) {
      const n = resolvedCount.value
      if (n != null) return n < 0 ? -1 : n
    }
    if (propMaxImages != null) {
      return propMaxImages < 0 ? -1 : propMaxImages
    }
    return -1
  })

  const formattedInitialFiles = computed<FilesListResponse | null>(() => {
    let val = model.value.default

    if (val && typeof val === 'object' && !Array.isArray(val) && Array.isArray((val as any).default)) {
      val = (val as any).default
    }

    if (!Array.isArray(val)) return makeEmptyFiles()

    const raw = toRaw(val)
    const images = raw.map((i: any) => ({ ...toRaw(i) }))

    return {
      images, files: [], temp: { images: [], files: [] }, stored: { images: [], files: [] },
    }
  })

  watch(
    () => imageFiles.value.images,
    (images) => {
      let current = model.value.default

      if (current && typeof current === 'object' && !Array.isArray(current) && Array.isArray((current as any).default)) {
        current = (current as any).default
      }

      const same =
        Array.isArray(current) &&
        current.length === images.length &&
        current.every((x: any, i: number) => x?.url === images[i]?.url)

      if (same) return

      if (model.value.default && typeof model.value.default === 'object' && !Array.isArray(model.value.default)) {
        updateDefault({ ...(model.value.default as any), default: images })
      } else {
        updateDefault(images)
      }
    },
    { deep: true },
  )

  function onRemove(item: ImageItem) { fileContainerRef.value?.removeFile(item) }
  function onRestore(item: ImageItem) { fileContainerRef.value?.restoreFile(item) }

  return {
    imageFiles,
    fileContainerRef,
    imagePurpose,
    displayImages,
    maxImages,
    formattedInitialFiles,
    onRemove,
    onRestore,
    resolvedModelName,
    makeEmptyFiles,
  }
}
