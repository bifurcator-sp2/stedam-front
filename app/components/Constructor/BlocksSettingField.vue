<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Vue3IconPicker } from 'vue3-icon-picker'
import 'vue3-icon-picker/dist/style.css'
import type { FilesListResponse, ImageItem } from '~/types/files'

interface SettingItem {
  key: string
  label: string
  type: 'string' | 'select' | 'int' | 'color' | 'bool' | 'icon' | 'image'
  default?: any
  allowed?: any[]
  purpose?: string
  children?: SettingItem[]
}

const props = defineProps<{
  /** id блока — нужен для FileContainer */
  blockId?: number | null
  /** имя модели для FileContainer */
  modelName?: string | null
}>()

const model = defineModel<SettingItem>({ required: true })

// Режим блока icon: 'manual' | 'picker'
const iconMode = ref<'manual' | 'picker'>('manual')

// ============================================================
// Тип "image"
// ============================================================

function emptyFiles(): FilesListResponse {
  return {
    images: [],
    files: [],
    temp: { images: [], files: [] },
    stored: { images: [], files: [] },
  }
}

const imageFiles = ref<FilesListResponse>(emptyFiles())

const fileContainerRef = ref<InstanceType<typeof FileContainer> | null>(null)

/**
 * purpose для FileContainer:
 *  - из model.purpose (если задан),
 *  - иначе — первый allowed.
 */
const imagePurpose = computed<string | null>(() => {
  if (typeof model.value.purpose === 'string' && model.value.purpose) {
    return model.value.purpose
  }
  const first = model.value.allowed?.[0]
  return typeof first === 'string' && first ? first : null
})

const maxImages = computed<string | number | null>(() => {
  if (typeof model.value.purpose === 'string' && model.value.purpose) {
    return -1;
  }
  const first = model.value.allowed?.[1]
  return first ? first : null
})

/**
 * modelName для FileContainer.
 */
const resolvedModelName = computed<string>(() => {
  return props.modelName || 'blocks'
})

/**
 * imageFiles.images → model.default
 */
watch(
  () => imageFiles.value.images,
  (images) => {
    model.value = { ...model.value, default: images }
  },
  { deep: true },
)

/**
 * model.default → imageFiles.images (только при первом монтировании)
 */
watch(
  () => model.value.default,
  (val) => {
    if (Array.isArray(val) && val.length && !imageFiles.value.images.length) {
      imageFiles.value = {
        ...imageFiles.value,
        images: val,
      }
    }
  },
  { immediate: true },
)

function onRemove(item: ImageItem) {
  fileContainerRef.value?.removeFile(item)
}

function onRestore(item: ImageItem) {
  fileContainerRef.value?.restoreFile(item)
}

// ============================================================
// Группы
// ============================================================

function updateChild(index: number, updated: SettingItem) {
  if (!model.value.children) return
  const next = model.value.children.slice()
  next[index] = updated
  model.value = { ...model.value, children: next }
}
</script>

<template>
  <div class="field" :class="{ 'field-group': model.children?.length }">
    <!-- Заголовок группы -->
    <div v-if="model.children?.length" class="field-group-header">
      <UIcon name="i-lucide-folder-tree" class="field-group-icon" />
      <span class="field-group-title">{{ model.label }}</span>
      <span class="field-group-key">{{ model.key }}</span>
    </div>

    <!-- Тип "icon" — иконка слева, настройки справа -->
    <template v-else-if="model.type === 'icon'">
      <div class="field-icon">
        <div class="field-icon-preview">
          <UIcon
            v-if="model.default"
            :name="model.default"
            class="field-icon-preview__svg"
          />
          <span v-else class="field-icon-preview__empty">нет иконки</span>
        </div>

        <div class="field-icon-body">
          <!-- Режим: ручной ввод -->
          <template v-if="iconMode === 'manual'">
            <div class="field-icon-input-row">
              <UInput
                v-model="model.default"
                size="xs"
                placeholder="i-lucide-hop"
                class="field-control"
              />
              <UButton
                icon="i-lucide-grid-2x2"
                size="xs"
                color="neutral"
                variant="soft"
                title="Выбрать из библиотеки"
                @click="iconMode = 'picker'"
              />
            </div>

            <div class="field-icon-hint">
              <div class="field-icon-hint__row">
                <span class="field-icon-hint__label">Синтаксис:</span>
                <code class="field-icon-hint__code">i-набор:имя</code>
              </div>

              <div class="field-icon-hint__row">
                <span class="field-icon-hint__label">Например:</span>
                <code class="field-icon-hint__code">i-lucide-hop</code>
              </div>

              <div class="field-icon-hint__links">
                <a
                  href="https://icones.js.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="field-icon-hint__link"
                >
                  <UIcon name="i-lucide-external-link" class="field-icon-hint__link-icon" />
                  icones.js.org
                </a>
                <a
                  href="https://lucide.dev/icons/"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="field-icon-hint__link"
                >
                  <UIcon name="i-lucide-external-link" class="field-icon-hint__link-icon" />
                  lucide.dev/icons
                </a>
              </div>
            </div>
          </template>

          <!-- Режим: пикер -->
          <template v-else>
            <div class="field-icon-input-row">
              <Vue3IconPicker
                v-model="model.default"
                placeholder="Поиск иконки..."
                icon-library="lucide"
                class="field-control"
              />
              <UButton
                icon="i-lucide-keyboard"
                size="xs"
                color="neutral"
                variant="soft"
                title="Ввести вручную"
                @click="iconMode = 'manual'"
              />
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- Тип "image" — FileContainer для картинок -->
    <template v-else-if="model.type === 'image'">
      <div class="field-image">
        <div class="field-image-header">
          <span class="field-image-label">{{ model.label }}</span>
          <span v-if="imagePurpose" class="field-image-purpose">{{ imagePurpose }}</span>
        </div>

        <!-- Dropzone -->
        <FileContainer
          ref="fileContainerRef"
          v-if="imagePurpose"
          :model-name="resolvedModelName"
          :model-id="blockId ?? 0"
          :purpose="imagePurpose"
          :max-images="maxImages"
          file-type="image"
          v-model:files="imageFiles"
        />

        <div v-else class="field-image-empty">
          <UIcon name="i-lucide-info" />
          <span>Не задан purpose для изображения</span>
        </div>

        <!-- Сетка превью -->
        <div v-if="imageFiles.images.length" class="field-image-grid">
          <ImageWrapper
            v-for="(img, idx) in imageFiles.images"
            :key="img.url ?? idx"
            :item="img"
            :siblings="imageFiles.images"
            :allow-drag-and-drop="false"
            :show-to-delete="true"
            @remove="onRemove($event)"
            @restore="onRestore($event)"
          >
            <img
              :src="img.url"
              class="w-16 h-16 object-cover rounded bg-gray-100"
            />
          </ImageWrapper>
        </div>
      </div>
    </template>

    <!-- Листовое поле: label + control в одну строку -->
    <template v-else>
      <div class="field-row">
        <label class="field-label" :title="model.key">{{ model.label }}</label>

        <UInput
          v-if="model.type === 'string'"
          v-model="model.default"
          size="xs"
          class="field-control"
        />
        <USelect
          v-else-if="model.type === 'select'"
          v-model="model.default"
          :items="model.allowed"
          size="xs"
          class="field-control"
        />
        <ColorPicker
          v-else-if="model.type === 'color'"
          v-model="model.default"
          :items="model.allowed ?? []"
          :columns="6"
          class="field-control"
        />
        <UInputNumber
          v-else-if="model.type === 'int'"
          v-model="model.default"
          size="xs"
          class="field-control"
        />
        <USwitch
          v-else-if="model.type === 'bool'"
          v-model="model.default"
          size="xs"
          class="field-control"
        />
      </div>
    </template>

    <!-- Дети -->
    <div v-if="model.children?.length" class="field-children">
      <BlocksSettingField
        v-for="(child, index) in model.children"
        :key="child.key"
        :model-value="child"
        :block-id="blockId"
        :model-name="modelName"
        @update:model-value="updateChild(index, $event)"
      />
    </div>
  </div>
</template>

<style scoped>
/* ====== Поле ====== */

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Листовая строка */
.field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  align-items: center;
  gap: 8px;
  min-height: 26px;
}

.field-label {
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--ui-text-muted, #6b7280);
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-control {
  min-width: 0;
}

/* ====== Группа ====== */

.field-group {
  gap: 6px;
  padding: 8px 8px 8px 10px;
  border: 1px solid var(--ui-border, #e5e7eb);
  border-radius: 6px;
  background: var(--ui-bg-elevated, #f9fafb);
}

.field-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ui-text, #111827);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field-group-icon {
  width: 13px;
  height: 13px;
  opacity: 0.55;
}

.field-group-title {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-group-key {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  font-weight: 400;
  color: var(--ui-text-muted, #9ca3af);
  text-transform: none;
  letter-spacing: 0;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
}

/* Вложенные группы — компактнее и с акцентной полосой */
.field-group .field-group {
  padding: 6px 6px 6px 8px;
  background: transparent;
}

.field-children {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 6px;
  margin-left: 2px;
  border-left: 2px solid var(--ui-border, #e5e7eb);
}

/* Уменьшаем внутренние отступы UInput/USelect/UInputNumber,
   чтобы панель стала компактнее */
.field-control :deep(input),
.field-control :deep(button) {
  padding-top: 2px;
  padding-bottom: 2px;
  font-size: 12.5px;
}

/* ====== Тип "icon" ====== */

.field-icon {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: flex-start;
  gap: 8px;
}

.field-icon-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 6px;
  border: 1px dashed var(--ui-border, #e5e7eb);
  border-radius: 6px;
  background: var(--ui-bg, #ffffff);
  overflow: hidden;
  flex-shrink: 0;
}

.field-icon-preview__svg {
  width: 100%;
  height: 100%;
  color: var(--ui-text, #111827);
}

.field-icon-preview__empty {
  font-size: 9px;
  line-height: 1;
  text-align: center;
  color: var(--ui-text-muted, #9ca3af);
}

/* Форсим svg тянуться от родителя */
.field-icon-preview__svg :deep(svg) {
  width: 100%;
  height: 100%;
}

.field-icon-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field-icon-input-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.field-icon-input-row .field-control {
  flex: 1 1 auto;
  min-width: 0;
}

/* ====== Подсказка ====== */

.field-icon-hint {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--ui-bg-elevated, #f9fafb);
  border: 1px solid var(--ui-border, #e5e7eb);
  font-size: 11px;
  line-height: 1.45;
  color: var(--ui-text-muted, #6b7280);
}

.field-icon-hint__row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.field-icon-hint__label {
  flex-shrink: 0;
  font-weight: 500;
}

.field-icon-hint__code {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  color: var(--ui-text, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.field-icon-hint__links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.field-icon-hint__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
  color: var(--ui-primary, #3b82f6);
  font-size: 11px;
  text-decoration: none;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.field-icon-hint__link:hover {
  background: var(--ui-bg-muted, rgba(59, 130, 246, 0.08));
  border-color: var(--ui-primary, #3b82f6);
}

.field-icon-hint__link-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

/* ====== Тип "image" ====== */

.field-image {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-image-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 0 2px;
}

.field-image-label {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--ui-text-muted, #6b7280);
  letter-spacing: 0.01em;
}

.field-image-purpose {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--ui-bg, #ffffff);
  border: 1px solid var(--ui-border, #e5e7eb);
  color: var(--ui-text-muted, #9ca3af);
}

.field-image-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--ui-bg-elevated, #f9fafb);
  border: 1px dashed var(--ui-border, #e5e7eb);
  font-size: 11.5px;
  color: var(--ui-text-muted, #6b7280);
}

.field-image-empty :deep(svg) {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

/* Сетка превью */
.field-image-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: flex-start;
}
</style>
