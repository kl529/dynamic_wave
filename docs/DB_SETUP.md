# 매매 기록 DB (PostgreSQL)

동파법 매매 기록을 저장한다. 2026-04에 Supabase에서 홈랩 PostgreSQL로 옮겼다. 브라우저는 DB에 직접 접근하지 않고, 서버 라우트 `/api/db/trade-records`가 로그인 확인 뒤 접근한다. DB에 연결되지 않으면 매매 기록 탭에 "DB에 연결할 수 없습니다"가 뜨고 분할은 초기 상태로 표시된다. 추천 전략 탭은 DB 없이 동작한다.

## 환경 변수

```
SITE_PASSWORD=...
PG_HOST=postgres      # docker-compose 의 homelab-net 안 PostgreSQL 컨테이너 이름
PG_PORT=5432
PG_USER=jiwon
PG_DB=homelab
PG_PASSWORD=...
```

## 테이블

새로 만들 때는 [`db_schema.sql`](../db_schema.sql)을 실행한다. 이미 있으면 파일 아래쪽의 마이그레이션 SQL만 실행한다(분할 번호 1~5 제한을 1~50으로).

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigserial | PK |
| `user_id` | text | 서버가 `default_user`로 고정 |
| `trade_date` | date | 매매 날짜 |
| `division_number` | integer | 분할 번호 (1~50) |
| `trade_type` | text | `BUY` / `SELL` |
| `quantity` | integer | 체결 수량 |
| `price` | numeric | 체결 단가 ($) |
| `amount` | numeric | `quantity × price` (서버가 계산) |
| `comment` | text | 메모 (500자 이하) |
| `created_at` | timestamptz | 생성 시각 |

## 배포 (홈랩 Docker)

```bash
git pull
docker compose up -d --build   # docker-compose.yml: 127.0.0.1:3300, homelab-net
```
