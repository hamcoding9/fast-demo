# fast-demo

React + TypeScript + Vite 기반 오디오 앱입니다. Step 2에서 Firebase Storage 목록 조회를 추가했습니다.
Tailwind CSS, Firebase Modular SDK, ESLint, Vitest, React Testing Library를 사용합니다.

## 실행

Node.js 24 이상에서 실행합니다.

```sh
npm ci
cp .env.example .env
npm run dev
```

`.env`의 설정값은 모두 빈 값으로 제공됩니다. Firebase 설정 없이도 화면과 내비게이션이
작동하며, Play 화면에는 설정 안내를 표시합니다. `.env`는 Git 추적에서 제외됩니다.

## Firebase 설정

Firebase Console의 웹 앱 설정에서 아래 값을 `.env`에 입력하고 Vite를 다시 시작합니다.

- 필수: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_APP_ID`
- 선택: `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_MESSAGING_SENDER_ID`

Storage Bucket에는 Console의 버킷 이름을 입력합니다. 설정값이나 개인키를 예제 파일에 넣지 않습니다.
`VITE_*` 변수는 브라우저에 노출되는 웹 앱 설정이며, 서비스 계정 개인키를 넣으면 안 됩니다.

Storage의 `recordings/` 바로 아래에 오디오 파일을 업로드하면 목록에 표시됩니다.
SDK `listAll`로 파일을 조회하고 `getMetadata`의 `name`, `timeCreated`로 이름과 업로드 날짜를
표시합니다. 날짜는 사용자 기기의 시간대로 표시하며 최신 파일부터 정렬합니다.
MIME 타입을 기준으로 오디오를 구분하고, MIME 타입이 없거나 일반 바이너리 타입인 경우
확장자를 사용합니다. WebM 녹음도 지원합니다. 하위 폴더는 재귀 조회하지 않습니다.

Storage Rules Version 2에서 대상 파일의 `list`와 `get` 권한이 필요합니다.
현재 단계에는 Firebase Auth 로그인이 없으므로 인증 사용자 전용 규칙을 사용하면 오류 상태를
표시합니다. 실제 프로젝트의 접근 정책에 맞춰 권한을 구성해야 합니다.
참고: [Firebase Storage 목록 조회 공식 문서](https://firebase.google.com/docs/storage/web/list-files).

`listAll`은 소규모 데모 목록을 대상으로 합니다. 파일 수가 많아지면 페이지 단위 조회로 전환해야 합니다.

## 검증

```sh
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

`npm run test`는 watch 모드, `npm run preview`는 빌드 결과 확인용입니다.

## 구조

- `src/components`: 공통 UI와 하단 내비게이션
- `src/pages`: Play / Record 화면
- `src/config/firebase.ts`: 환경변수 검증 및 지연 초기화
- `src/hooks`: 페이지 전환 및 비동기 목록 상태
- `src/services/audioStorage.ts`: Storage 목록·메타데이터 조회
- `src/types`: 공통 타입
- `src/test`: 테스트 환경 설정
- `.github/workflows/ci.yml`: push / pull_request 검증

## 구현 범위

기본 화면은 Play이며 하단 버튼으로 Record와 전환합니다. 외부 라우팅 라이브러리 없이
React 상태로 전환하므로 URL과 브라우저 방문 기록은 변경하지 않습니다.
모바일에서는 세로 배치, 데스크톱에서는 목록과 플레이어 미리보기를 나란히 표시합니다.
고정 내비게이션, 본문 하단 여백, Safe Area, 키보드 포커스 및 본문 건너뛰기를 지원합니다.

Play는 Loading / Empty / Error / 설정 누락 상태와 새로고침을 지원합니다.
조회 또는 메타데이터 요청 실패 시 오류 안내를 표시하고 새로고침으로 재시도합니다.
재생 아이콘은 비활성화되어 있으며 오디오 다운로드, 재생, 녹음 및 파일 저장은 구현하지 않았습니다.

## 테스트 범위

Storage 및 Firebase 초기화 SDK를 Mock하여 정상 목록, 빈 목록, API 오류, 필수 설정 누락,
초기화 재사용 및 오디오 필터링을 검증합니다. UI 테스트는 로딩, 파일명·날짜, 새로고침,
오류 재시도, 설정 안내를 검증합니다. 기존 마우스·키보드 내비게이션 회귀 테스트도 유지합니다.

자동 테스트는 실제 Firebase에 연결하지 않습니다. 실제 연결은 `.env`에 프로젝트 설정을 입력하고
접근 권한을 설정한 뒤 수동으로 확인해야 합니다. CI에서도 Firebase 설정 없이 Mock 테스트를 실행합니다.

Firebase 패키지의 간접 의존성 `@grpc/grpc-js`는 보안 수정 버전을 사용하도록
`package.json`의 `overrides`로 지정합니다. 앱은 Firebase App / Storage 모듈만 사용합니다.

## GitHub Actions

`fast-demo/`가 Git 저장소 루트입니다. 이 폴더에서 Git 및 npm 명령을 실행합니다.
push와 pull request에서 Lint → Typecheck → Test → Build가 실행됩니다.
`package-lock.json`을 함께 커밋합니다.
