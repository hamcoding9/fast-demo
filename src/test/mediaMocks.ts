import { vi } from 'vitest'

export class MockAudio extends EventTarget {
  src = ''
  preload = ''
  currentTime = 0
  duration = Number.NaN
  paused = true
  ended = false
  play = vi.fn(async () => {
    this.paused = false
    this.ended = false
    this.dispatchEvent(new Event('play'))
  })
  pause = vi.fn(() => {
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  })
  load = vi.fn()
  removeAttribute = vi.fn((name: string) => { if (name === 'src') this.src = '' })
  addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
    super.addEventListener(type, listener, options)
  })
  removeEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) => {
    super.removeEventListener(type, listener, options)
  })
}

export function installMediaMocks() {
  const instances: MockAudio[] = []
  // jsdom has no native modal implementation; provide a mockable test-only shim.
  for (const method of ['showModal', 'close'] as const) {
    if (!HTMLDialogElement.prototype[method]) {
      Object.defineProperty(HTMLDialogElement.prototype, method, { configurable: true, writable: true, value() {} })
    }
  }
  vi.stubGlobal('Audio', class extends MockAudio {
    constructor() {
      super()
      instances.push(this)
    }
  })
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
  return instances
}
