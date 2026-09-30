import type { RouterConfig } from '@nuxt/schema'

export default <RouterConfig>{
  // @ts-expect-error - base is a valid Vue Router option
  base: '/app/',
}
