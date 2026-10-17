# FAST Demo

A responsive audio demo for recording, previewing, uploading, and listening to audio. Built with React, TypeScript, Vite, Tailwind CSS, Firebase Storage, and Cloud Firestore.

## Features

- Group audio libraries accessed through `/?groupId=group-a`.
- Audio player with play/pause, seeking, and playback time.
- Microphone recording with a timer, local preview, and re-recording.
- Storage uploads with progress and duplicate prevention.
- Mobile-friendly layout, fixed bottom navigation, and keyboard support.

## Quick Start

Requires Node.js 24+ and npm.

```sh
npm ci
cp .env.example .env
```

Fill in `.env` with your Firebase web app configuration, then start the development server:

```sh
npm run dev
```

Open [localhost:5173/?groupId=group-a](http://localhost:5173/?groupId=group-a). Restart Vite after changing environment variables.

## Firebase Setup

Enable Cloud Firestore and Firebase Storage in the same project. Configure Security Rules to allow the intended reads and uploads.

Create two independent **top-level collections**. For example:

```text
groups/group-a
  name: "Research Group A"
  isActive: true

audios/audio-demo
  groupId: "group-a"
  fileName: "demo.mp3"
  storagePath: "recordings/group-a/demo.mp3"
  contentType: "audio/mpeg"
  size: 733645
  status: "ready"
  uploadedAt: <Firestore timestamp>
```

For a sample library, upload an audio file to Storage and register its metadata in `audios`. Use the actual file path, MIME type, size in bytes, and upload timestamp. The Play tab displays the group's `ready` documents, newest first.

Using an authenticated Firebase CLI, deploy the configured index and wait for it to become enabled:

```sh
firebase deploy --only firestore:indexes --project fast-app-2026
```

## Commands

```sh
npm run lint              # ESLint
npm run typecheck         # TypeScript
npm run test -- --run     # Vitest and React Testing Library
npm run build             # Production output in dist/
npm run preview           # Preview the production build
```

GitHub Actions runs Lint, Typecheck, Test, and Build on pushes and pull requests. Automated tests mock Firebase and browser media APIs.
