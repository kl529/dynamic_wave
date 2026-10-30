# DESIGN.md

> 이 프로젝트 UI 작업의 기준 문서다. 전역 취향은 `~/.codex/skills/lyva-design/references/taste-rules.md`를 따르고, 여기에는 이 프로젝트에만 해당하는 것만 적는다.

## 기준 화면
- 기준 페이지: `/` 메인 (`src/app/page.tsx`). 헤더(로고 + 백테스팅 버튼) → 탭 → 카드 순서.
- 공통 컴포넌트: Ant Design 5 `Card`, `Table`(size small), `Tag`, `Statistic`. 카드 제목은 `Card title`, 보조 정보는 `extra`.

## 토큰
- 배경 `#f5f5f5`, 카드 흰색, 보조 글자 `#8c8c8c` / `#595959`
- 포인트: antd 기본 파랑 `#1677ff`, 헤더 버튼 그라데이션 `UI.COLORS.PRIMARY_GRADIENT`
- 의미 색: 상승·매수 빨강 `#cf1322`(Tag `red`), 하락·매도 파랑 `#0958d9`(Tag `blue`), 유지 회색(Tag `default`)
- 모드 색: 안전 green, 공세 orange, 강세 red, 현금 default
- 글자: 핵심 수치 40px/700, 카드 제목 antd 기본, 보조 12~13px
- 테마: 라이트만 지원

## 레이아웃
- 본문 좌우 패딩 24px, 탭 간격 20px(390px에서 탭 4개가 한 줄에 보이도록)
- 카드 본문 패딩 16px, 데스크톱에서 2단(좌 10 / 우 14), 모바일 1단

## 문구
- 매매 용어: 매수·매도, LOC(장마감 지정가), MOC(장마감 시장가), 목표 비중, 정규장
- 날짜는 `YYYY-MM-DD`, 금액은 `$` 접두

## 지적 기록
<!-- 사용자 디자인 지적을 고친 뒤 한 줄 규칙으로 추가한다. 형식: - 규칙 (YYYY-MM-DD) -->
