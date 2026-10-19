import { vi } from 'vitest'
import type { StorageError, StorageReference, UploadMetadata, UploadTask, UploadTaskSnapshot } from 'firebase/storage'

export class MockUploadTask {
  snapshot: UploadTaskSnapshot
  private subscribed = false
  private next?: (snapshot: UploadTaskSnapshot) => void
  private error?: (error: StorageError) => void
  private done?: () => void
  unsubscribe = vi.fn(() => { this.subscribed = false })
  cancel = vi.fn(() => { this.snapshot.state = 'canceled'; return true })
  on = vi.fn((_event: string, next: (snapshot: UploadTaskSnapshot) => void, error: (error: StorageError) => void, done: () => void) => {
    this.subscribed = true
    this.next = next
    this.error = error
    this.done = done
    return this.unsubscribe
  })
  constructor(reference: StorageReference, blob: Blob, metadata: UploadMetadata = {}) {
    this.snapshot = {
      bytesTransferred: 0, totalBytes: blob.size, state: 'running', ref: reference,
      metadata: { name: reference.name || reference.fullPath.split('/').pop(), fullPath: reference.fullPath,
        timeCreated: '2026-10-11T18:00:00Z', contentType: metadata.contentType, customMetadata: metadata.customMetadata, size: blob.size },
    } as UploadTaskSnapshot
  }
  sdkTask() { return this as unknown as UploadTask }
  progress(bytes: number) {
    this.snapshot.bytesTransferred = bytes
    if (this.subscribed) this.next?.(this.snapshot)
  }
  fail(error: unknown) { if (this.subscribed) this.error?.(error as StorageError) }
  complete() {
    this.snapshot.state = 'success'
    this.snapshot.bytesTransferred = this.snapshot.totalBytes
    if (this.subscribed) this.done?.()
  }
}
