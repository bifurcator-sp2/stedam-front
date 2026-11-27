<!-- app/components/Constructor/BlockSettingTypes/SettingStringField.vue -->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useSanitize } from '~/composables/useSanitize'

const props = defineProps<{
  label: string
  fieldKey?: string
  icon?: string
  value?: any
  /** Показать переключатель «свернуть группу» (admin + есть children). */
  collapsible?: boolean
  expanded?: boolean
}>()

const emit = defineEmits<{
  update: [value: string]
  toggle: []
}>()

const { sanitizeHtml } = useSanitize()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const stringDraft = ref<string>('')
const isEditing = ref(false)

const modelString = computed<string>(() => {
  const v = props.value
  return typeof v === 'string' ? v : ''
})

const stringModel = computed<string>({
  get() { return isEditing.value ? stringDraft.value : modelString.value },
  set(raw: string) { stringDraft.value = raw },
})

function resizeTextarea() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

function commitString() {
  const clean = sanitizeHtml(stringDraft.value)
  isEditing.value = false
  if (clean !== props.value) {
    emit('update', clean)
  }
  stringDraft.value = clean
}

function onStringFocus() {
  stringDraft.value = modelString.value
  isEditing.value = true
}

function onStringBlur() { commitString() }

onMounted(async () => {
  await nextTick()
  resizeTextarea()
})

watch(stringModel, async () => {
  await nextTick()
  resizeTextarea()
})

watch(modelString, (val) => {
  if (!isEditing.value) stringDraft.value = val
})
</script>

<template>
  <div class="flex min-w-0 items-center gap-1.5 pl-px">
    <span
      v-if="collapsible"
      class="inline-flex size-3.5 cursor-pointer items-center justify-center text-muted transition-transform duration-200 hover:text-highlighted"
      @click.stop="emit('toggle')"
    >
      <UIcon name="i-lucide-chevron-right" class="size-3.5 transition-transform duration-200" :class="{ 'rotate-90': expanded }" />
    </span>
    <UIcon :name="icon" class="size-3 shrink-0 text-muted" />
    <span class="truncate text-[11.5px] font-semibold text-highlighted">{{ label }}</span>
    <span v-if="fieldKey" class="rounded-full border border-default bg-default px-1.5 py-px font-mono text-[9.5px] text-muted">{{ fieldKey }}</span>
    <slot name="actions" />
  </div>

  <textarea
    ref="textareaRef" v-model="stringModel" rows="1" spellcheck="false"
    class="w-full min-h-8 max-h-[260px] resize-none overflow-y-auto rounded-md border border-default bg-default px-2.5 py-2 font-[inherit] text-[12.5px] leading-normal text-highlighted shadow-sm outline-none transition placeholder:text-muted hover:border-default focus:border-primary focus:ring-2 focus:ring-primary/20"
    @input="autoResize" @focus="onStringFocus" @blur="onStringBlur"
  />
</template>
