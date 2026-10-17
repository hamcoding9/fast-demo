# FAST Demo

A responsive audio recording and playback application built with React, TypeScript, and Firebase Storage / Cloud Firestore. Record a microphone clip, preview it locally, upload it to Storage, and play registered audio from a group library.

## Project Overview

FAST Demo provides two mobile-friendly screens:

- **Play** queries the top-level Firestore `audios` collection for the verified URL group, displays file names and upload dates, and opens an accessible audio player modal.
- **Record** captures microphone audio, shows a timer, provides a local preview, and uploads completed recordings to Firebase Storage.

The app uses browser media APIs directly. No audio playback or recording library is required. The interface, accessibility labels, dates, messages, and documentation are in English.

## Key Features

- Fixed bottom navigation, responsive layouts, safe-area spacing, and keyboard support.
- Group audio library backed by Firestore, with loading, empty, error, configuration guidance, and refresh states.
- Audio player with play/pause, seeking, elapsed/total time, replay, and file switching.
- Native dialog modal with Escape dismissal, focus restoration, and playback cleanup.
- Microphone recording with permission handling, recording status, and elapsed-time tracking.
- Runtime MIME support detection for WebM/Opus, MP4/AAC, and Ogg, with a browser-default fallback.
- Local preview, re-recording, and explicit uploads with progress and success/error feedback.
- Unique upload names, matching file extensions and Content Types, and a 10 MiB upload limit.
- Duplicate prevention for a recording while its upload is pending and after it succeeds.
- Cleanup of microphone tracks, recorders, timers, media listeners, Object URLs, and pending uploads.

## Tech Stack

| Area | Technology |
| --- | --- |
| UI | React, TypeScript, Tailwind CSS |
| Development and build | Vite, Node.js 24+, npm |
| Cloud storage | Firebase JavaScript SDK, Modular API |
| Recording and playback | MediaDevices, MediaRecorder, HTML5 Audio |
| Tests | Vitest, React Testing Library, jsdom |
| Quality and CI | ESLint, TypeScript, GitHub Actions |

## Project Structure

```text
fast-demo/                         # Git repository root
├── .github/workflows/ci.yml
├── .env.example
├── firebase.json
├── firebase.storage.rules
├── src/
│   ├── components/                # AudioLibrary, AudioPlayer, AudioRecorder, navigation
│   ├── config/firebase.ts         # Environment validation and lazy Firebase initialization
│   ├── hooks/                     # Navigation, library, playback, recording, upload state
│   ├── pages/                     # PlayPage and RecordPage
│   ├── services/
│   │   ├── audioStorage.ts        # Download URLs and legacy resumable uploads
│   │   ├── audios.ts              # Group audio metadata queries in Firestore
│   │   ├── groups.ts              # Group ID validation and group document lookup
│   │   ├── recordingFormat.ts     # MediaRecorder MIME selection
│   │   └── recordingUploadFormat.ts # Upload validation, extensions, unique names
│   ├── test/                      # Test setup and platform/SDK mocks
│   ├── types/
│   ├── App.tsx
│   └── recordUploadPlay.test.tsx   # Integration test using production services and hooks
├── package.json
└── package-lock.json
```

## Testing & CI

```sh
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

`npm run test` starts watch mode. Tests mock Firebase SDK and browser media boundaries only; application services and hooks remain real in the recording/upload and Firestore playback integration suite. The suite explicitly verifies that legacy uploads do not create group metadata yet.

Coverage includes navigation, Firebase configuration, group-scoped Firestore queries, metadata validation, refresh/stale-response handling, Storage download errors, player controls and cleanup, recording/timer/permission/MIME behavior, upload success/failure/progress/duplicates, cancellation, and playback from registered Firestore metadata. Automated tests do not connect to a real Firebase bucket or capture a physical microphone.

`.github/workflows/ci.yml` runs `npm ci`, Lint, Typecheck, Test, and Build on every push and pull request using Node.js 24. Local check results and workflow configuration are separate from a successful hosted GitHub Actions run. See `VALIDATION.md` for the verification performed for this change.

The indirect `@grpc/grpc-js` dependency is overridden to a patched version; the app imports Firebase App, Storage and Firestore modules.

## Group audio library — Step 3

Open `http://localhost:5173/?groupId=group-a` (there is no slash between `?` and `groupId`). The app first checks `groups/group-a` for a nonempty string `name` and boolean `isActive: true`. Groups must be created manually in the Firebase Console. Without a verified group, cloud listing and upload remain blocked; local recording and preview remain available.

Firestore uses two independent **top-level collections**:

```text
groups/{groupId}
  name: "Research Group A"       (string)
  isActive: true                 (boolean)

audios/{audioId}
  groupId: "group-a"             (string)
  fileName: "Demo recording.wav" (string)
  storagePath: "recordings/group-a/audio-demo.wav" (string)
  contentType: "audio/wav"        (string)
  size: 1024                     (number, positive integer; actual file size)
  status: "ready"                (string)
  uploadedAt: <upload date>       (Firestore timestamp, not a string)
```

For a manual test, create document `audios/audio-demo` with the fields above and use the path, MIME type, size and upload date of an **existing** Storage audio object. Document ID `audio-demo` and `storagePath` are separate values. Metadata alone does not create an audio file. Reload the group URL or select Refresh, then select the file to play it using a Storage Download URL.

The list queries `groupId == currentGroup`, `status == ready`, ordered by `uploadedAt` descending. Pending uploads and other groups are not displayed. Invalid metadata produces guidance instead of a partial list. Old requests are ignored on refresh, group change and unmount. Storage object enumeration is no longer used.

The composite index is defined in `firestore.indexes.json` and referenced by `firebase.json`. From the repository root, use an authenticated Firebase CLI account with access to the project:

```sh
firebase deploy --only firestore:indexes --project fast-app-2026
```

This command deploys indexes only. Wait for the index to finish building in Firestore Console → Indexes before retrying the query. See the [Firebase CLI index deployment reference](https://github.com/firebase/firebase-tools/blob/main/src/firestore/README.md#deploy-an-index-configuration). Firestore permissions must separately allow the group/document queries; this step does not change or deploy Security Rules. Group IDs are data partitions, not authentication or authorization.

**Intermediate limitation:** the Record tab still uses the existing flat `recordings/` upload and does not write Firestore metadata. A newly uploaded file will not automatically appear in the group library until Step 4 is implemented. Existing objects are never deleted, moved or auto-assigned to a group. To test an existing flat object, explicitly create its metadata with `storagePath: "recordings/existing-file.wav"`. Nested paths must use the current group's folder.

The Step 3 automated checks use mocked Firebase SDK/media APIs. Live Firebase queries, remote index deployment, deployed Rules behavior and remote GitHub Actions execution require separate verification. `VALIDATION.md` describes the earlier global-library version and is a historical snapshot, not a Step 3 live verification record.
