# modern-dashboard

레거시 HamaH-Cloud 관제 시스템(`ui/iot/dashboard/es-main-dashboard-new.html` 등,
jQuery + AdminLTE + OpenLayers)을 **React 19 + Vite + TypeScript**로 재구축하고
**SafeRobo Design System**을 적용한 스마트 안전관제 대시보드입니다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # dist/ 정적 빌드
```

## 화면 구성

| 라우트 | 내용 | 레거시 원본 |
|------|------|------|
| `/` **통합 관제** | GIS 지도 기반 실시간 위치 관제 + KPI + 고정가스검침기 + 탭 그리드 + 하단 현황 패널 | `es-main-dashboard-new.html` |
| `/stats` 통계 대시보드 | KPI, 입퇴실 추이, 구역별 알림, 직종·협력사별, 구역별 투입, 주간 추이 | `es-*-dashboard.html` 차트류 |
| `/workers` 작업자 현황 | 검색/상태 필터 테이블 | 작업자 화면 |
| `/sensors` IoT 센서/장비 | 배터리·통신 상태 | `es-sensor-list.html` 등 |
| `/alerts` 알림 이력 | 분류 필터 | 알림 화면 |

## 통합 관제 (첫 화면) — 레거시 대응 관계

- **GIS 실시간 위치 관제** ([SiteMap.tsx](src/components/SiteMap.tsx)):
  현장 경계 폴리곤(주황) · 구역(건물) 폴리곤 · 고정형 비콘(보라 사각) ·
  게이트웨이(파랑 원) · **작업자 마커가 비콘 웨이포인트를 따라 1초 간격 이동**
  (위험 작업자는 적색 펄스). 레거시 OpenLayers + 비콘 위치 데이터의 SVG 재구현으로,
  실연동 시 [site.ts](src/data/site.ts)의 좌표/경로를 실시간 API로 교체.
  - **2D / 2.5D 뷰 전환**: 아이소메트릭 투영 + 건물 압출 블록, 마커는 핀 위에 표시
  - **전체 화면 모드**: 지도만 뷰포트 전체로 확대(ESC로 종료)
  - **줌/팬**: 휠·버튼(+/−/초기화) 줌, 드래그 팬 — viewBox 기반, 마커는 역배율로 화면 크기 유지
  - **배경 지도 타일** (2D 전용, 레거시 지도/스카이뷰 대응): 기본(그리드) / 지도(CARTO 다크·라이트) /
    위성(Esri World Imagery). 로컬 좌표(1unit≈1.25m)를 현장 앵커 기준 Web Mercator로 변환해
    줌/팬과 자동 정합, 줌 레벨에 따라 타일 z 자동 선택 — 앵커·축척은 `SiteMap.tsx`의 `ANCHOR`/`M_PER_UNIT`
  - **작업자 선택**: 마커 클릭 시 최근 60초 이동 궤적(점선) + 위치 이력 패널(시각·좌표), 빈 곳 클릭으로 해제
- **KPI 상태 보드**: 위급 상황(심박/유해가스/SOS) · 위험 작업(위험 작업/입조) ·
  전체 작업자 현황(잔류/입실/퇴실)
- **고정가스검침기 카드**: O₂(시안 %)/H₂S(보라 PPM) 실시간 스파크라인 — 1초 갱신
- **탭 그리드**: 작업자(심박수·피부온도·입퇴실) / 작업 목록(위험도·상태) /
  고정형 비콘(Major·Minor) / 트래커(SOS·배터리)
- **하단 패널**: 배터리 및 상태 이상 IoT 센서 / 위급 상황 현황(조치 상태) /
  구역별 알림 현황 도넛
- **헤더**: 현장명 + 날씨(기온·풍속·습도·PM10) + 새로고침 카운트다운

### 위젯별 독립 갱신 (부분 federation)

레거시처럼 새로고침 주기에 화면 전체를 다시 그리지 않는다. 페이지는 상태를 갖지 않고,
갱신이 필요한 위젯만 자체 타이머로 리렌더링된다:

| 위젯 | 주기 | 격리 방식 |
|---|---|---|
| 지도 작업자 레이어 | 1초 | `SiteMap` 내부 tick — 정적 레이어(격자·구역·비콘)는 `memo`로 뷰 모드 변경 시에만 재계산 |
| 고정가스검침기 | 1초 | `GasPanel` 내부 상태 |
| 작업자 바이탈(심박) | 2초 | `WorkerTable` 내부 상태 |
| 헤더 시계·카운트다운 | 1초 | `HeaderClock`로 분리 — 사이드바/페이지 트리 리렌더링 없음 |
| KPI·하단 패널·정적 테이블 | 조회 시 | `memo` 격리 (실연동 시 위젯별 폴링 주기 부여 지점) |

## SafeRobo Design System

- 다크 기본(`#0f172a`/`#1e293b`/`#3b82f6`), 라이트 폴백, 사이드바는 항상 다크 틴트
- IBM Plex Sans KR / Mono(장비 ID·타임스탬프), 카드 rounded-14px, 44px 컨트롤
- 토큰: [src/index.css](src/index.css) · 공용 컴포넌트: [src/components/ui.tsx](src/components/ui.tsx)

## 데이터

목업: [src/data/mock.ts](src/data/mock.ts)(통계·센서), [src/data/site.ts](src/data/site.ts)(지도·실시간).
실서버 연동 시 두 모듈만 API 클라이언트로 교체하면 됩니다.
