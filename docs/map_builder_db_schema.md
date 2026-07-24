# Map Builder 저장 데이터 명세 — DB 스키마 설계서

> 맵 빌더(`/map-builder`)가 생성·자동 저장하는 값을 서버 DB로 이전하기 위한
> **단일 기준 데이터 명세**다. 필드·제약은 `src/data/builder.ts`(2026-07-24 main)의
> 실제 구현과 1:1로 대응한다.
>
> 관련 문서: [beacon_planning.md](./beacon_planning.md) — 이 데이터의 소비처(플래닝 엔진) 명세

---

## 1. 현재 저장 방식과 이전 대상

```text
현재  : localStorage["builder-map-v1"] ← 편집할 때마다 BuilderMap 전체 JSON 자동 저장
이전 후: 사업소(site)별 맵 1건을 서버 DB에 저장 — 저장 포맷은 아래 BuilderMap 그대로
소비처 : 맵 빌더(편집) · 관제 대시보드(siteModel 변환) · 비콘 배치 리포트(플래닝 엔진)
```

- 저장 단위는 **맵 1건(BuilderMap)** 이다. 요소(elements)는 항상 맵과 함께 통째로
  읽고 쓴다(부분 업데이트 없음 — 빌더가 배열 전체를 재저장).
- 파생·계산 값은 저장하지 않는다(§6).

---

## 2. 최상위 문서 — BuilderMap

| 필드 | 타입 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|
| `anchor.lat` | number | ✅ | 37.3503 | 캔버스 중심 (500, 320)에 대응하는 위도 |
| `anchor.lng` | number | ✅ | 126.9401 | 〃 경도 — 배경 지도 타일 매핑 기준 |
| `rotation` | number | ✅ | 0 | 도면 기본 보기 회전각(°) — **뷰 전용**, 계산에는 미사용 |
| `metersPerUnit` | number | 선택 | 1.25 | 축척(m/unit). 구버전 저장본은 로드 시 1.25로 승격 |
| `elements` | BElement[] | ✅ | [] | 도면 요소 배열 (§3) |

- 좌표계: Local Cartesian, 기준 영역 1000×640 unit, 작업 여백 ±2000 unit.
- `version` 필드는 도입하지 않았다 — `metersPerUnit` 유무로 신·구 포맷을 구분한다.

### 저장 JSON 예시 (실제 포맷 그대로)

```json
{
  "anchor": { "lat": 37.3503, "lng": 126.9401 },
  "rotation": 15,
  "metersPerUnit": 1.25,
  "elements": [
    { "kind": "building", "id": "el-1", "name": "하수유입동", "shape": "rect",
      "x": 120, "y": 220, "w": 160, "h": 100, "floorsUp": 1, "floorsDown": 2 },
    { "kind": "fence", "id": "el-2", "name": "소화조 가스 위험구역", "shape": "rect",
      "x": 200, "y": 150, "w": 135, "h": 120, "level": 1 },
    { "kind": "obstacle", "id": "el-3", "name": "OB-01", "fenceId": "el-2",
      "level": 1, "shape": "rect", "x": 237, "y": 194, "w": 30, "h": 20, "effect": "blocked" },
    { "kind": "symbol", "id": "el-4", "type": "beacon", "name": "BC-AUTO-01",
      "x": 333.4, "y": 195, "level": 1, "fenceId": "el-2" },
    { "kind": "symbol", "id": "el-5", "type": "elevator", "name": "EV-01",
      "x": 250, "y": 270, "level": 1, "toLevel": -2, "width": 20, "depth": 24, "rot": 90 },
    { "kind": "tunnel", "id": "el-6", "name": "공동구-01", "level": -1, "width": 8,
      "bpts": [ { "x": 300, "y": 400 }, { "x": 500, "y": 340, "c": true }, { "x": 700, "y": 400 } ],
      "path": [[300, 400], [400, 370], ...] }
  ]
}
```

---

## 3. 요소(BElement) 명세 — `kind` 판별 유니언

공통 필드: `id`(맵 내 유일, `el-{seq}` 형식) · `kind` · `name`.
좌표·크기 단위는 전부 **unit**(1 unit = `metersPerUnit` m).

### 3.1 `building` — 건물

| 필드 | 타입 | 필수 | 설명·제약 |
|---|---|---|---|
| `shape` | `'rect' \| 'ellipse' \| 'poly'` | ✅ | 타원은 bbox 내접, poly는 `pts` 사용 |
| `x, y, w, h` | number | ✅ | bbox 좌상단 + 크기 (poly도 bbox 항상 동기화) |
| `floorsUp` | number | ✅ | 지상 층수 ≥ 0 |
| `floorsDown` | number | ✅ | 지하 층수 ≥ 0 (0/0이면 F1 취급) |
| `pts` | BPoint[] | poly만 | 절대좌표 정점. `c: true`면 곡선 제어점(Q 베지어) |
| `rot` | number | 선택 | 오브젝트 회전각(° 시계방향, bbox 중심 기준). 0/무회전이면 생략 |

### 3.2 `fence` — 지오펜스 (플래닝 대상 영역)

| 필드 | 타입 | 필수 | 설명·제약 |
|---|---|---|---|
| `shape` / `x,y,w,h` / `pts` / `rot` | 건물과 동일 | ✅ | — |
| `level` | number | ✅ | 귀속 층 — 1=지상1층, -1=지하1층, -2=지하2층 |

- 위험 등급은 저장하지 않는다(관제 실데이터에서 동적 판정).
- 삭제 시 소속 비콘·장애물도 함께 삭제된다(§5 관계).

### 3.3 `room` — 작업영역

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `shape`(생략=rect) / `x,y,w,h` / `pts` / `rot` | 건물과 동일 | — | 구버전 저장본은 `shape` 없음 |
| `level` | number | ✅ | 층 선택지는 소속 건물(중심점 포함 판정) 층 구성에 귀속 |

### 3.4 `tunnel` — 지하 공동구

| 필드 | 타입 | 필수 | 설명·제약 |
|---|---|---|---|
| `path` | `[number, number][]` | ✅ | 표시·판정용 폴리라인. `bpts`가 있으면 그 샘플 결과(캐시) |
| `bpts` | BPoint[] | 선택 | 곡선 편집 원본(`c: true`=곡선 제어점). 편집 시 `path` 재샘플 |
| `level` | number | ✅ | 지하 전용 (-1, -2) |
| `width` | number | 선택 | 통로 폭, 기본 10 · 범위 3~15 (`MIN/MAX_TUNNEL_WIDTH`) |

### 3.5 `symbol` — 설비 심볼 (`type` 판별)

공통: `x, y`(중심점) · `level`(설치 층 — 건물 내부면 건물 층 구성에 귀속).

| `type` | 라벨 | 전용 필드 | 제약·기본값 |
|---|---|---|---|
| `beacon` | 비콘 | `fenceId` | **지오펜스 내부에만 배치** — 소속 지오펜스 id·층 상속. 플래닝 확정 비콘은 이름 `BC-AUTO-nn` |
| `gateway` | 중계기 | `roof?` | `roof: true`면 소속 건물 옥상 설치(3D 상단 배치). 건물 밖 이동 시 해제 |
| `gas` | 가스검침기 | — | 측정값은 저장하지 않음(관제에서 id 기반 목업/실데이터) |
| `door` | 출입구 | `width?`, `rot?` | 폭 8~60(기본 12). `rot`은 벽면 스냅 시 자동 산출(접선 방향) |
| `stairs` | 계단실 | `toLevel?`, `width?`, `rot?` | 시작 `level` → 도착 `toLevel`. 폭 20~100(기본 34). 건물 벽과 겹치지 않게 클램프 |
| `elevator` | 엘리베이터 | `toLevel?`, `width?`, `depth?`, `rot?` | 폭·깊이 8~60(기본 16). 건물 층 구간 연결 |
| `entrance` | 공동구 출입구 | — | 공동구 라인 근처 배치 시 라인에 스냅 + 공동구 층 상속 |

### 3.6 `obstacle` — 장애물(구조물)

| 필드 | 타입 | 필수 | 설명·제약 |
|---|---|---|---|
| `fenceId` | string | ✅ | 소속 지오펜스 — **지오펜스 내부에만 배치**, 드롭 시 자동 상속 |
| `level` | number | ✅ | 소속 지오펜스 층 상속 |
| `shape` | `'rect' \| 'ellipse'` | ✅ | 다각형 미지원 (MVP) |
| `x, y, w, h` | number | ✅ | bbox 좌상단 + 크기. 폭·높이 6~200 |
| `rot` | number | 선택 | 회전각(°) |
| `effect` | `'blocked' \| 'heavy' \| 'light'` | ✅ | 신호 차폐 효과 — 기본 `blocked` (재질·감쇠 dB는 미도입) |

### 3.7 BPoint (공용)

```ts
{ x: number, y: number, c?: boolean }   // c: true → 곡선 제어점 (Q 베지어 스무딩)
```

---

## 4. DB 스키마 제안

빌더·대시보드·리포트 모두 **맵 전체를 통째로 읽는** 소비 패턴이므로,
**JSONB 단일 문서 저장(A안)을 권장**한다. 요소 단위 질의·통계가 필요해지면
B안(요소 테이블 분리)으로 확장한다.

### A안 (권장) — 맵 = JSONB 문서 1건

```sql
CREATE TABLE builder_map (
  id              BIGSERIAL PRIMARY KEY,
  site_id         BIGINT      NOT NULL REFERENCES site(id),   -- 사업소 (예: 군포 하수도)
  name            TEXT        NOT NULL DEFAULT '기본 맵',
  anchor_lat      DOUBLE PRECISION NOT NULL DEFAULT 37.3503,
  anchor_lng      DOUBLE PRECISION NOT NULL DEFAULT 126.9401,
  rotation_deg    REAL        NOT NULL DEFAULT 0,
  meters_per_unit REAL        NOT NULL DEFAULT 1.25 CHECK (meters_per_unit > 0),
  elements        JSONB       NOT NULL DEFAULT '[]',          -- §3 배열 그대로
  revision        INTEGER     NOT NULL DEFAULT 1,             -- 저장마다 +1 (충돌 감지)
  updated_by      BIGINT      REFERENCES app_user(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, name)
);

-- 요소 종류별 부분 조회가 필요할 때를 위한 GIN 인덱스 (선택)
CREATE INDEX idx_builder_map_elements ON builder_map USING GIN (elements jsonb_path_ops);
```

- 클라이언트 `saveBuilderMap()` ↔ `PUT /sites/{siteId}/maps/{mapId}` 전체 치환.
  `revision`을 낙관적 잠금으로 사용(불일치 시 409 → 재로드).
- 이력이 필요하면 `builder_map_history(map_id, revision, elements, saved_at)` 부속
  테이블에 저장 시점 스냅샷을 append (빌더 Undo 50단계는 세션 메모리 유지).

### B안 (확장) — 요소 정규화 테이블

요소별 검색·권한·부분 수정·통계(예: "사업소 전체 비콘 수")가 요구될 때:

```sql
CREATE TABLE map_element (
  map_id     BIGINT NOT NULL REFERENCES builder_map(id) ON DELETE CASCADE,
  el_id      TEXT   NOT NULL,                    -- 'el-42' (맵 내 유일)
  kind       TEXT   NOT NULL CHECK (kind IN
               ('building','fence','room','tunnel','symbol','obstacle')),
  sym_type   TEXT,                               -- kind='symbol'일 때 §3.5의 type
  name       TEXT   NOT NULL,
  level      INTEGER,                            -- building은 NULL (floorsUp/Down 사용)
  fence_id   TEXT,                               -- beacon·obstacle 소속 (el_id 참조)
  x REAL, y REAL, w REAL, h REAL, rot REAL,
  props      JSONB  NOT NULL DEFAULT '{}',       -- 나머지 kind별 필드 (pts·path·bpts·
                                                 --   floorsUp/Down·toLevel·width·depth·
                                                 --   effect·roof 등)
  PRIMARY KEY (map_id, el_id)
);
CREATE INDEX idx_map_element_kind  ON map_element (map_id, kind);
CREATE INDEX idx_map_element_fence ON map_element (map_id, fence_id);
```

- `fence_id`는 같은 맵의 `el_id`를 가리키는 **soft 참조** — 지오펜스 삭제 시
  애플리케이션 규칙(§5)에 따라 소속 요소를 함께 삭제한다.

---

## 5. 관계·무결성 규칙 (애플리케이션 레벨)

DB 제약이 아닌 **빌더가 강제하는 도메인 규칙**이다. 서버 검증 시 동일하게 적용한다.

| 규칙 | 내용 |
|---|---|
| 비콘 소속 | `symbol(type=beacon).fenceId` → 같은 맵의 `fence.id`. 지오펜스 내부에만 생성·이동, 층은 지오펜스 상속 |
| 장애물 소속 | `obstacle.fenceId` → `fence.id`. 중심점이 지오펜스 내부, 층 상속 |
| 캐스케이드 | 지오펜스 삭제 → 소속 비콘·장애물 삭제. 지오펜스 이동/회전 → 소속 요소 동반 변환 |
| 건물 귀속(파생) | 심볼·작업영역의 소속 건물은 **좌표 포함 판정으로 파생** — 저장하지 않음 |
| 공동구 동반(파생) | 공동구에 접한 비콘·출입구 동반 이동 — 거리 판정 파생, 저장하지 않음 |
| 좌표 범위 | x ∈ [-2000, 3000], y ∈ [-2000, 2640] (기준 영역 ±2000 unit) |
| 층 값 | 정수, 0 제외 (1=지상1층, -1=지하1층 …). 공동구는 음수만 |
| id 규칙 | `el-{n}` — 로드 시 최대 n에서 시퀀스 재개. 서버는 형식만 검증 |
| 심볼 타입 sanitize | 팔레트에서 제거된 타입(CCTV·비상벨·펌프·전기설비 등)은 로드 시 필터 — 서버 저장 전에도 동일 필터 권장 |

---

## 6. 저장하지 않는 것 (파생·휘발 데이터)

| 데이터 | 사유 |
|---|---|
| `shapeOutline` 폴리곤, 회전 bake 결과 | 렌더·계산 시 매번 파생 |
| siteModel 변환 결과(Zone·MapPoint·SiteGeofence·SiteObstacle 등) | 대시보드 마운트 시 변환 |
| 비콘 플래닝 preview(제안 비콘·음영 샘플·진행률) | 리포트 세션 상태 — [배치 적용] 시에만 일반 비콘으로 `elements`에 커밋 |
| 빌더 Undo 히스토리(50단계) | 세션 메모리 전용 |
| 가스검침기 측정값, 지오펜스 위험 등급 | 관제 실데이터 도메인 (별도 시계열/이벤트 저장소) |

---

## 7. 마이그레이션·호환성

1. **구버전 포맷 승격** — 로드 시 자동 처리(서버 이전 시 1회 배치로 동일 적용):
   - `BElement[]` 배열만 저장된 최구버전 → `{ anchor: 기본값, rotation: 0, metersPerUnit: 1.25, elements }`
   - `metersPerUnit` 없는 v1 → 1.25 승격
   - 제거된 심볼 타입 필터, 공동구 `width` 범위(3~15) 클램프
2. **localStorage → DB 이전**: 최초 접속 시 로컬 저장본이 있으면 서버로 업로드 후
   로컬 키 제거(또는 오프라인 캐시로 유지 — 충돌 시 `revision` 비교).
3. **키**: 클라이언트 캐시 키 `builder-map-v1`은 유지 가능 — 포맷 판별은 필드 유무로.
