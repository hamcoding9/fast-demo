# FAST Demo

A responsive audio recording and playback application built with React, TypeScript, and Firebase Storage. Record a microphone clip, preview it locally, upload it, and play it from the audio library.

## Project Overview

FAST Demo provides two mobile-friendly screens:

- **Play** lists audio files from `recordings/`, displays file names and upload dates, and opens an accessible audio player modal.
- **Record** captures microphone audio, shows a timer, provides a local preview, and uploads completed recordings to Firebase Storage.

The app uses browser media APIs directly. No audio playback or recording library is required. The interface is currently in Korean; this documentation is in English.

## Key Features

- Fixed bottom navigation, responsive layouts, safe-area spacing, and keyboard support.
- Firebase Storage library with loading, empty, error, configuration guidance, and refresh states.
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
│   │   ├── audioStorage.ts        # Listing, metadata, download URLs, resumable uploads
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

`npm run test` starts watch mode. Tests mock Firebase SDK and browser media boundaries only; application services and hooks remain real in the Record → Upload → Play integration test.

Coverage includes navigation, Storage configuration/list/download errors, player controls and cleanup, recording/timer/permission/MIME behavior, upload success/failure/progress/duplicates, cancellation, and refreshed library playback after upload. Automated tests do not connect to a real Firebase bucket or capture a physical microphone.

`.github/workflows/ci.yml` runs `npm ci`, Lint, Typecheck, Test, and Build on every push and pull request using Node.js 24. Local check results and workflow configuration are separate from a successful hosted GitHub Actions run. See `VALIDATION.md` for the verification performed for this change.

The indirect `@grpc/grpc-js` dependency is overridden to a patched version; the app imports only Firebase App and Storage modules.