// app/plugins/stedam-loading.ts
import { vStedamLoading } from '~/directives/stedamLoading'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('stedam-loading', vStedamLoading)
})
