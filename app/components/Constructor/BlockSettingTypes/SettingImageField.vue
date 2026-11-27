<!-- app/components/Constructor/BlockSettingTypes/SettingImageField.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { ImageItem } from '~/types/files'
import FileContainer from '~/components/FileContainer.vue'
import { useImageField } from './useImageField'

const props = defineProps<{
  node: any
  label: string
  blockId?: number | null
  modelName?: string | null
  settings?: Record<string, any> | any[] | null
  maxImages?: number | null
  path?: string
}>()

const emit = defineEmits<{
  update: [value: any]
}>()

function updateDefault(val: any) {
  emit('update', val)
}

function resolvePath(root: any, path: string): any {
  if (root == null || !path) return undefined
  if (!Array.isArray(root) && typeof root === 'object' && 'key' in root) {
    root = [root]
  }

  if (Array.isArray(root)) {
    const [head, ...rest] = path.split('.')
    const found = root.find((it: any) => it?.key === head)
    if (!found) return undefined
    if (rest.length === 0) return found.default
    return resolvePath(found.children ?? found.default ?? found, rest.join('.'))
  }
  return path.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), root)
}

const resolvedModelName = computed(() => props.modelName || 'blocks')

const {
  imageFiles,
  fileContainerRef,
  imagePurpose,
  displayImages,
  maxImages,
  formattedInitialFiles,
  onRemove,
  onRestore,
} = useImageField({
  model: computed(() => props.node) as any,
  updateDefault,
  resolvePath,
  settings: props.settings,
  path: props.path,
  propMaxImages: props.maxImages,
  resolvedModelName,
})
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div class="flex items-center justify-between gap-2 px-0.5">
      <span class="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-highlighted">
        <UIcon name="i-lucide-image" class="size-3.5 text-primary/85" />
        {{ label }}
      </span>

      <div class="flex items-center gap-1.5">
        <span v-if="imagePurpose" class="rounded-full border border-default bg-default px-1.5 py-0.5 font-mono text-[9.5px] text-muted shadow-sm">
          {{ imagePurpose }}
        </span>
        <span v-if="maxImages >= 0" class="rounded-full border border-default bg-default px-1.5 py-0.5 font-mono text-[9.5px] text-muted shadow-sm">
          max {{ maxImages }}
        </span>
        <slot name="actions" />
      </div>
    </div>

    <FileContainer
      ref="fileContainerRef"
      :model-name="resolvedModelName" :model-id="blockId ?? 0" :purpose="imagePurpose"
      :max-images="maxImages" :initial-files="formattedInitialFiles"
      file-type="image" v-model:files="imageFiles"
    />

    <div v-if="!imagePurpose" class="flex items-center gap-1.5 rounded-md border border-dashed border-default bg-elevated px-3 py-2.5 text-[11.5px] text-muted">
      <UIcon name="i-lucide-info" class="size-3.5 shrink-0" />
      <span>Не задан purpose для изображения</span>
    </div>

    <div v-if="imageFiles.images.length && displayImages" class="flex flex-wrap items-start gap-2">
      <ImageWrapper
        v-for="(img, idx) in imageFiles.images" :key="img.url ?? idx"
        :item="img" :siblings="imageFiles.images" :allow-drag-and-drop="false" :show-to-delete="true"
        @remove="onRemove($event as ImageItem)" @restore="onRestore($event as ImageItem)"
      >
        <img :src="img.url" class="size-[68px] rounded-md border border-default bg-muted object-cover shadow-sm transition hover:-translate-y-0.5 hover:scale-[1.02] hover:border-primary/40 hover:shadow-md" />
      </ImageWrapper>
    </div>
  </div>
</template>
