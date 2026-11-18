// app/directives/stedamLoading.ts
import { createVNode, reactive, render, type Directive, type VNode } from 'vue'
import StedamLoadingOverlay from '~/components/StedamLoadingOverlay.vue'

export type StedamLoadingBinding
  = | boolean
    | undefined
    | {
      value?: boolean
      /** Постоянная подпись шага (например, «Загрузка урока») */
      action?: string
      text?: string
      statusText?: string
    }

interface State {
  el: HTMLElement
  /** Обёртка в дереве приложения, пока идёт загрузка */
  host: HTMLElement | null
  /** Контейнер render-корня оверлея; живёт всё время, как и state */
  shellHost: HTMLElement
  /** render-корень оверлея */
  shell: VNode | null
  /**
   * Живые пропсы оверлея: один reactive-объект на всё время жизни.
   * Фразы меняются часто, поэтому палец шарит сюда, а Vue сам перерисовывает
   * StedamLoadingOverlay — без ручного render на каждый тик.
   */
  shellProps: { loading: boolean, actionText: string, statusText: string }
  contentHost: HTMLElement | null
  opacity: string
  pointerEvents: string
  timer: ReturnType<typeof setTimeout> | null
}

const states = new WeakMap<HTMLElement, State>()

// Transition из StedamLoadingOverlay
const TRANSITION_MS = 150

function toText(value: unknown): string {
  if (value == null) return ''
  return typeof value === 'string' ? value : String(value)
}

interface ParsedBinding {
  loading: boolean
  actionText: string
  statusText: string
}

function parseBinding(binding: StedamLoadingBinding): ParsedBinding {
  if (typeof binding === 'boolean') {
    return { loading: binding, actionText: '', statusText: '' }
  }
  return {
    loading: !!binding?.value,
    actionText: toText(binding?.action),
    statusText: toText(binding?.text ?? binding?.statusText)
  }
}

function getState(el: HTMLElement): State {
  const cached = states.get(el)
  if (cached) return cached

  // Оверлей — отдельный render-корень. Рендерим его только в документе приложения:
  // всё, что отрисовано в detached-узле, Vue не может перепривязать к DOM.
  const shellHost = document.createElement('div')
  shellHost.className = 'stedam-loading-overlay-shell'
  shellHost.style.position = 'absolute'
  shellHost.style.inset = '0'
  shellHost.style.zIndex = '10'

  const state: State = {
    el,
    host: null,
    shellHost,
    shell: null,
    shellProps: reactive({ loading: false, actionText: '', statusText: '' }),
    contentHost: null,
    opacity: '',
    pointerEvents: '',
    timer: null
  }

  states.set(el, state)

  return state
}

function mount(state: State, parsed: ParsedBinding) {
  if (state.timer) {
    clearTimeout(state.timer)
    state.timer = null
  }

  const { el } = state

  if (state.host?.isConnected) {
    updateOverlay(state, true, parsed)
    return
  }

  // Обёртка ставится на место элемента, а сам элемент (со всеми привязками Vue)
  // переносится внутрь как контент — без нового render-корня для него.
  const host = document.createElement('div')
  host.className = 'stedam-loading-host'
  host.style.position = 'relative'

  const contentHost = document.createElement('div')
  contentHost.className = 'stedam-loading-overlay-content'
  contentHost.style.position = 'relative'
  contentHost.style.transition = `opacity ${TRANSITION_MS}ms`

  host.appendChild(contentHost)
  host.appendChild(state.shellHost)

  // Сначала ставим обёртку на место элемента, и только потом переносим `el` внутрь.
  el.parentNode?.insertBefore(host, el)
  contentHost.appendChild(el)

  state.host = host
  state.contentHost = contentHost
  state.opacity = contentHost.style.opacity
  state.pointerEvents = contentHost.style.pointerEvents

  // Значения ставим ДО render(): vnode сразу собирается поверх reactive-объекта,
  // поэтому первый кадр уже показывает оверлей с фразой, а последующие смены
  // статуса Vue видит сам.
  state.shellProps.loading = true
  state.shellProps.actionText = parsed.actionText
  state.shellProps.statusText = parsed.statusText

  const shell = createVNode(StedamLoadingOverlay, state.shellProps)
  shell.children = { default: () => [] }
  render(shell, state.shellHost)
  state.shell = shell
}

function updateOverlay(state: State, loading: boolean, parsed: ParsedBinding) {
  state.shellProps.loading = loading
  state.shellProps.actionText = parsed.actionText
  state.shellProps.statusText = parsed.statusText

  // Подпись шага сменилась, пока оверлей уже поднят. Через reactive-пропсы
  // компонент узнает об этом отдельным патчем — в текущем тике он ещё держит
  // старый текст. Правим его props напрямую, чтобы новый шаг был виден
  // не позже следующего кадра.
  if (loading && state.shell?.component) {
    Object.assign(state.shell.component.props, state.shellProps)
  }

  const contentHost = state.contentHost
  if (!contentHost) return
  contentHost.style.opacity = loading ? '0' : state.opacity
  contentHost.style.pointerEvents = loading ? 'none' : state.pointerEvents
}

function unmountLoading(state: State) {
  // Оверлей уходит своей Transition; обёртку убираем только после неё,
  // чтобы не выдёргивать shellHost, пока Vue ещё проигрывает leave.
  updateOverlay(state, false, { loading: false, actionText: '', statusText: '' })

  if (state.timer) clearTimeout(state.timer)
  state.timer = setTimeout(() => {
    state.timer = null
    release(state)
  }, TRANSITION_MS)
}

function release(state: State) {
  const host = state.host
  if (!host || !host.parentNode) return

  // Возвращаем элемент на место обёртки (insertBefore сам вынет его из contentHost).
  host.parentNode.insertBefore(state.el, host)
  host.parentNode.removeChild(host)

  // Оверлей уже отыграл leave — снимаем его, но корень оставляем живым.
  render(null, state.shellHost)
  state.shell = null
  state.host = null
  state.contentHost = null
}

function update(el: HTMLElement, parsed: ParsedBinding) {
  const state = getState(el)

  if (parsed.loading) mount(state, parsed)
  else if (state.host) unmountLoading(state)
  else updateOverlay(state, false, parsed)
}

function unmounted(el: HTMLElement) {
  const state = states.get(el)
  if (!state) return

  states.delete(el)
  if (state.timer) clearTimeout(state.timer)
  state.host = null
  state.contentHost = null
  state.shell = null
}

/**
 * Оборачивает элемент в StedamLoadingOverlay, пока значение истинно.
 *
 * @example v-stedam-loading="isLoading"
 * @example v-stedam-loading="{ value: isLoading, action: 'Загрузка урока', statusText: phrase }"
 */
export const vStedamLoading: Directive<HTMLElement, StedamLoadingBinding> = {
  mounted(el, { value }) {
    const parsed = parseBinding(value)
    if (!parsed.loading) return
    update(el, parsed)
  },
  updated(el, { value }) {
    const parsed = parseBinding(value)
    if (!states.has(el) && !parsed.loading) return
    update(el, parsed)
  },
  unmounted
}
