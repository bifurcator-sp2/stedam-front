import { vInlineEdit } from '~/directives/inlineEdit'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('inline-edit', vInlineEdit)
})
