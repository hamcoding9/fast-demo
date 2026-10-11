import { vi } from 'vitest'

export function makeMockStream() {
  const track = { stop: vi.fn() }
  const stream = { getTracks: vi.fn(() => [track]) }
  return { track, stream }
}

export class MockMediaRecorder extends EventTarget {
  static isTypeSupported = vi.fn((type: string) => type === 'audio/webm;codecs=opus')
  state: RecordingState = 'inactive'
  mimeType: string
  readonly stream: MediaStream
  readonly options?: MediaRecorderOptions
  start = vi.fn(() => {
    this.state = 'recording'
    this.dispatchEvent(new Event('start'))
  })
  stop = vi.fn(() => {
    this.state = 'inactive'
    this.emitData(new Blob(['recorded sound'], { type: this.mimeType }))
    this.dispatchEvent(new Event('stop'))
  })
  addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
    super.addEventListener(type, listener, options)
  })
  removeEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) => {
    super.removeEventListener(type, listener, options)
  })
  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    super()
    this.stream = stream
    this.options = options
    this.mimeType = options?.mimeType || 'audio/mp4'
  }
  emitData(data: Blob) {
    const event = new Event('dataavailable')
    Object.defineProperty(event, 'data', { value: data })
    this.dispatchEvent(event)
  }
}

export function installRecorderMocks() {
  const instances: MockMediaRecorder[] = []
  const streams: ReturnType<typeof makeMockStream>[] = []
  const mediaDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
  const createUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  const revokeUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  const settings = { failPreferredFormat: false }
  const getUserMedia = vi.fn(async () => {
    const mock = makeMockStream()
    streams.push(mock)
    return mock.stream as unknown as MediaStream
  })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  let nextUrl = 0
  const createObjectURL = vi.fn(() => `blob:recording-${++nextUrl}`)
  const revokeObjectURL = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
  MockMediaRecorder.isTypeSupported.mockReset().mockImplementation((type) => type === 'audio/webm;codecs=opus')
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('MediaRecorder', class extends MockMediaRecorder {
    constructor(stream: MediaStream, options?: MediaRecorderOptions) {
      if (settings.failPreferredFormat && options?.mimeType) throw new DOMException('Format rejected', 'NotSupportedError')
      super(stream, options)
      instances.push(this)
    }
  })
  function restore() {
    if (mediaDescriptor) Object.defineProperty(navigator, 'mediaDevices', mediaDescriptor)
    else Reflect.deleteProperty(navigator, 'mediaDevices')
    if (createUrlDescriptor) Object.defineProperty(URL, 'createObjectURL', createUrlDescriptor)
    else Reflect.deleteProperty(URL, 'createObjectURL')
    if (revokeUrlDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeUrlDescriptor)
    else Reflect.deleteProperty(URL, 'revokeObjectURL')
  }
  return { instances, streams, getUserMedia, createObjectURL, revokeObjectURL, settings, restore }
}
