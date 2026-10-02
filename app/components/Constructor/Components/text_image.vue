<script setup lang="ts">

const value = defineModel<[]>({ default: () => [] })

const props = defineProps<{
  mode?: 'form' | 'body'
}>()

import { computed } from 'vue'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number = min
): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.round(n), min), max)
}


function getDefault(blocks: [] | undefined, path: string): string {
  let list = blocks
  let found: Block | undefined
  for (const key of path.split('.')) {
    found = list?.find(b => b.key === key)
    if (!found) return ''
    list = found.children
  }
  return found?.default ?? ''
}
const previewImage = 'https://img.magnific.com/premium-photo/trees-park-autumn_1048944-1833622.jpg?semt=ais_hybrid&w=740&q=80';

const previewTitle = computed(() => getDefault(value.value, 'text.title'))
const previewText = computed(() => getDefault(value.value, 'text.text'))
const tag = computed(() => `Prose${getDefault(value.value, 'text.header-type').toUpperCase()}`)
const layout = computed(() => getDefault(value.value, 'layout'))
const needDisplayImage = computed(() => layout.value != 'text' )
const needDisplayText = computed(() => layout.value != 'image' )
const imagesBcgClass = computed(() => ' '+getDefault(value.value, 'images.background-color')+' ' )
const textBcgClass = computed(() => ' '+getDefault(value.value, 'text.background-color')+' ' )
const cols = 12;
const textPercent = computed(() => getDefault(value.value, 'text.cols')/cols )
const imagesPercent = computed(() => clamp(1-textPercent.value, 0, 1 ) )
const imagesCount = computed(() => {
  const def = getDefault(value.value, 'images.count');
  if(def<0){
    return 10;
  }
  return def;
})
const imagesInRow = computed(() => clamp(getDefault(value.value, 'images.images-in-row'), 1, 6) )
const textSize = computed(() => ' '+getDefault(value.value, 'text.text-size')+' ' )
const pt = computed(() => ' pt-'+getDefault(value.value, 'text.padding-top')+' ' )
const pb = computed(() => ' pb-'+getDefault(value.value, 'text.padding-bottom')+' ' )
const pl = computed(() => ' pl-'+getDefault(value.value, 'text.padding-left')+' ' )
const pr = computed(() => ' pr-'+getDefault(value.value, 'text.padding-right')+' ' )




const colsClass = computed(() => ({
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
}[imagesInRow.value] ?? 'grid-cols-3'))


const layoutClass = computed(() => ({
  'text':  ' ',
  'image':  ' ',
  'text-right':  'flex-row',   // текст справа, картинка слева
  'text-left':   'flex-row-reverse',           // текст слева, картинка справа
  'text-top':    'flex-col-reverse',           // текст сверху, картинка снизу
  'text-bottom': 'flex-col',   // текст снизу, картинка сверху
}[layout.value ?? 'text-left']))

const textCols = computed(() =>
  clampInt(getDefault(value.value, 'text.text-cols'), 1, 4, 1)
)

</script>

<template>
  <ConstructorBlockLayout :mode="props.mode ?? 'body'">
    <template #form>
      <div>Тут ничего нет еще</div>
    </template>

    <template #body>
      <div>
        <div :class="'flex items-start justify-center gap-4 '+layoutClass">
            <div v-if="needDisplayImage" :class="'flex  flex-wrap gap-4 '+imagesBcgClass+' grid '+colsClass" :style="'flex: 0 0 '+(imagesPercent*100)+'%'">
              <img v-for="i in imagesCount" :key="'img'+i" :src="previewImage" :class="' h-auto'" />
            </div>
            <div v-if="needDisplayText" :class="textBcgClass+pt+pb+pl+pr" :style="'flex: 0 0 '+(textPercent*100)+'%'">
              <component :is="tag" class="mt-0">{{ previewTitle }}</component>
              <ProseP :style="{ columnCount: textCols }" :class="textSize">{{previewText}}</ProseP>
            </div>
        </div>
      </div>
    </template>
  </ConstructorBlockLayout>
</template>

<style scoped>

</style>
