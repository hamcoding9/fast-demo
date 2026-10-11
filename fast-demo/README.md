# fast-demo

React + TypeScript + Vite 기반 오디오 앱의 Step 1 UI입니다.
Tailwind CSS, ESLint, Vitest, React Testing Library를 사용합니다.

## 실행

Node.js 24 이상에서 실행합니다.

```sh
npm ci
npm run dev
```

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
- `src/hooks`: 페이지 전환 상태
- `src/services`: 후속 서비스 구현 위치
- `src/data`: 표시 전용 예시 데이터
- `src/types`: 공통 타입
- `src/test`: 테스트 환경 설정
- `.github/workflows/ci.yml`: push / pull_request 검증

## 구현 범위

기본 화면은 Play이며 하단 버튼으로 Record와 전환합니다. 외부 라우팅 라이브러리 없이
React 상태로 전환하므로 URL과 브라우저 방문 기록은 변경하지 않습니다.
모바일에서는 세로 배치, 데스크톱에서는 목록과 플레이어 미리보기를 나란히 표시합니다.
고정 내비게이션, 본문 하단 여백, Safe Area, 키보드 포커스 및 본문 건너뛰기를 지원합니다.

목록은 샘플이며 재생·녹음 버튼은 비활성화되어 있습니다.
실제 오디오, 마이크 권한 요청, 파일 저장, Firebase는 구현하지 않았습니다.

## GitHub Actions

`fast-demo` 폴더를 저장소 루트로 올리면 push와 pull request에서
Lint → Typecheck → Test → Build가 실행됩니다. `package-lock.json`을 함께 커밋합니다.
상위 폴더를 저장소 루트로 사용한다면 workflow를 그 루트의 `.github/workflows`로 옮기고,
작업 디렉터리와 npm 캐시 경로를 `fast-demo`에 맞게 조정해야 합니다.
