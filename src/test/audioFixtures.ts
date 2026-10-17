import type { AudioFile } from '../types/audio'

export function audioFixture(overrides: Partial<AudioFile> = {}): AudioFile {
  return { id: 'audio-one', name: 'one.wav', groupId: 'group-a', storagePath: 'recordings/group-a/audio-one.wav',
    contentType: 'audio/wav', size: 1024, status: 'ready', uploadedAt: '2026-10-11T12:00:00Z', ...overrides }
}
