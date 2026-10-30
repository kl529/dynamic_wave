# 자동매매·백테스트 오픈소스 비교 (2026-10-30)

> GitHub API 조회 2026-10-30 14:40 KST · 27개 저장소 · 원자료 `trading-repos-2026-10-30.json` · 설치·수익률 재현은 vectorbt 교차 검증 1건만 했다
> 9월 조사(`ai-investing-open-source.md`)의 LLM 도구 7개를 갱신하고, 백테스트 프레임워크·자동매매 봇·한국 증권사 API를 더했다

## 결론

- **우리 방식(미국 ETF를 하루 1번, 한국 증권사로)에 그대로 쓸 완성품은 없다.** 인기 저장소는 종목 분석 LLM이거나 암호화폐 봇이다.
- **쓸모 있는 건 두 종류다.** ① 증권사 공식 API(한국투자 `open-trading-api`, 키움 `Kiwoom-REST-API`) — 나중에 주문 자동화에 쓴다. ② 독립 백테스터(vectorbt·bt·backtesting.py) — 우리 계산이 맞는지 확인하는 용도. vectorbt로 실제 확인했고 세전 연복리 차이 0.001%p 이내였다 (`../validation/crosscheck.md`).
- **별 수는 품질 근거가 아니다.** 2026년에 생긴 LLM 저장소들이 별이 비정상적으로 빠르게 늘었고, 일부는 별·포크를 요청한다.
- **해외주식 양도세 22%를 계산해 주는 도구는 없었다.** 우리 하네스가 직접 처리한다.

## 우리 시스템과 나란히

| 항목 | 우리 (dongpa) | LLM·AI 분석 도구 | 백테스트 프레임워크 | 자동매매 봇 | 한국 증권사 API |
|---|---|---|---|---|---|
| 하는 일 | QLD 추세 신호, 주문 수량, 백테스트 | 종목 리포트·매수 의견 | 전략 시뮬레이션 | 실시간 자동 주문 | 시세·주문 API |
| 미국 ETF | 예 | 일부 | 예 | 아니오 (암호화폐) | 예 (해외주식) |
| 한국 증권사 주문 | 수동 (앱이 수량 계산) | 없음 (Vibe-Trading만 모의·국내) | 없음 | 없음 | **공식** |
| 미래 데이터 방지 | 테스트로 고정 | LLM 기억 문제로 근본 해결 불가 | 도구마다 체결 기본값 다름 | — | — |
| 세금 22% | 반영 | 없음 | 없음 | 없음 | 없음 |
| 장기 검증 | 1995~2026 (합성 포함), 표본 외 | 대부분 수개월~수년 | 사용자 몫 | 사용자 몫 | — |

## LLM·AI 투자 분석 (9개)

| 저장소 | 별 | 최근 push | 용도 | 백테스트 | 실거래 | 한국 증권사 | 적합도 |
|---|---|---|---|---|---|---|---|
| [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) | 118.4k | 2026-10-27 | 분석가(펀더멘털·심리·뉴스·기술)·강세/약세 토론·트레이더·리스크·PM으로 구성된 다중 LLM 에이전트 매매 판단… | 예 | 아니오 | 없음 | 하 |
| [openbq-org/OpenBB](https://github.com/openbq-org/OpenBB) | 74.9k | 2026-10-24 | Open Data Platform(ODP): 공개·유료 데이터 공급자를 Python/REST/MCP로 통합하는 데이… | 아니오 | 아니오 | 없음 | 하 |
| [ZhuLinsen/daily_stock_analysis](https://github.com/ZhuLinsen/daily_stock_analysis) | 67.3k | 2026-10-25 | 관심종목을 LLM으로 매일 분석해 "결정 대시보드"를 메신저·메일로 푸시하는 시스템… | 예 | 아니오 | 없음 | 하 |
| [virattt/ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) | 64.4k | 2026-10-27 | LLM 투자자 페르소나 에이전트가 매매 판단을 내리는 교육용 개념검증. 현재는 `aihf` 터미널 앱… | 예 | 아니오 | 없음 | 하 |
| [microsoft/qlib](https://github.com/microsoft/qlib) | 49.8k | 2026-10-30 | 데이터·ML 모델·포트폴리오 전략·평가를 잇는 AI 퀀트 연구 플랫폼(RD-Agent 연계) | 예 | 아니오 | 없음 | 하 |
| [HKUDS/Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) | 37.2k | 2026-10-30 | 자연어 질의→데이터 로딩→전략 생성→백테스트→보고서→(선택) 브로커 연결까지 잇는 LLM 트레이딩 에이전트 작업공간 | 예 | 예 | 일부(모의·국내) | 하 |
| [AI4Finance-Foundation/FinGPT](https://github.com/AI4Finance-Foundation/FinGPT) | 21.5k | 2026-10-25 | 금융 감성분석용 LLM 미세조정·데이터셋·벤치마크 프로젝트 | 아니오 | 아니오 | 없음 | 하 |
| [xbtlin/ai-berkshire](https://github.com/xbtlin/ai-berkshire) | 16.9k | 2026-10-27 | Claude Code/Codex용 가치투자 리서치 스킬 모음… | 아니오 | 아니오 | 없음 | 하 |
| [AI4Finance-Foundation/FinRobot](https://github.com/AI4Finance-Foundation/FinRobot) | 8.3k | 2026-10-24 | LLM 기반 금융 리서치 에이전트. V2는 Python 계산(DCF/DDM 등)+LLM 서술 보고서, Desktop… | 아니오 | 아니오 | 없음 | 하 |

## 백테스트 프레임워크 (8개)

| 저장소 | 별 | 최근 push | 용도 | 백테스트 | 실거래 | 한국 증권사 | 적합도 |
|---|---|---|---|---|---|---|---|
| [nautechsystems/nautilus_trader](https://github.com/nautechsystems/nautilus_trader) | 31.1k | 2026-10-30 | Rust 코어 + Python 제어의 고성능 이벤트 기반 백테스트·라이브 엔진(동일 코드로 연구→실거래) | 예 | 예 | 없음 | 하 |
| [mementum/backtrader](https://github.com/mementum/backtrader) | 23.6k | 2024-08-19 | 이벤트 기반 Python 백테스트·라이브 트레이딩 라이브러리(고전 표준) | 예 | 예 | 없음 | 하 |
| [QuantConnect/Lean](https://github.com/QuantConnect/Lean) | 22.3k | 2026-10-30 | C#/Python 이벤트 기반 알고리즘 트레이딩 엔진(QuantConnect 클라우드의 오픈소스 코어) + Lean… | 예 | 예 | 직접 지원 없음. 단 한국투자증권 공 | 중 |
| [AI4Finance-Foundation/FinRL](https://github.com/AI4Finance-Foundation/FinRL) | 16.9k | 2026-10-25 | 심층강화학습(DRL) 기반 금융 매매 프레임워크… | 예 | 예 | 없음 | 하 |
| [polakowo/vectorbt](https://github.com/polakowo/vectorbt) | 9.6k | 2026-10-28 | NumPy/Numba(선택적 Rust) 기반 벡터화 백테스트·대량 파라미터 스윕 도구… | 예 | 아니오 | 없음 | 중 |
| [kernc/backtesting.py](https://github.com/kernc/backtesting.py) | 9.2k | 2026-08-05 | 단일 종목 OHLC 기반의 가볍고 문서화가 잘 된 Python 백테스트 라이브러리 | 예 | 아니오 | 없음 | 중 |
| [pmorissette/bt](https://github.com/pmorissette/bt) | 3.0k | 2026-10-25 | 알고리즘 블록(스케줄·선택·비중·리밸런싱)을 조합하는 포트폴리오 비중 기반 백테스트 라이브러리(ffn 통계) | 예 | 아니오 | 없음 | 상 |
| [stefan-jansen/zipline-reloaded](https://github.com/stefan-jansen/zipline-reloaded) | 2.0k | 2026-10-26 | Quantopian Zipline 이벤트 기반 백테스터의 커뮤니티 유지판 | 예 | 아니오 | 없음 | 하 |

## 자동매매 봇 (4개)

| 저장소 | 별 | 최근 push | 용도 | 백테스트 | 실거래 | 한국 증권사 | 적합도 |
|---|---|---|---|---|---|---|---|
| [freqtrade/freqtrade](https://github.com/freqtrade/freqtrade) | 56.1k | 2026-10-30 | 암호화폐 전용 오픈소스 매매 봇(Telegram/웹 UI, 백테스트·최적화·FreqAI) | 예 | 예 | 없음 | 하 |
| [hummingbot/hummingbot](https://github.com/hummingbot/hummingbot) | 20.8k | 2026-10-20 | CEX/DEX 대상 고빈도·마켓메이킹 암호화폐 봇 프레임워크(Condor AI 하네스) | 아니오 | 예 | 없음 | 하 |
| [jesse-ai/jesse](https://github.com/jesse-ai/jesse) | 8.7k | 2026-10-29 | 암호화폐 알고리즘 매매 프레임워크(연구·백테스트·최적화·라이브) | 예 | 예 | 없음 | 하 |
| [Drakkar-Software/OctoBot](https://github.com/Drakkar-Software/OctoBot) | 6.9k | 2026-10-27 | 시각적 UI의 암호화폐 매매 봇(그리드·DCA·바스켓·TradingView·AI 커넥터) | 예 | 예 | 없음 | 하 |

## 한국 증권사 API (6개)

| 저장소 | 별 | 최근 push | 용도 | 백테스트 | 실거래 | 한국 증권사 | 적합도 |
|---|---|---|---|---|---|---|---|
| [koreainvestment/open-trading-api](https://github.com/koreainvestment/open-trading-api) | 1.7k | 2026-10-27 | 한국투자증권 KIS Open API 공식 샘플 저장소… | 예 | 예 | 공식 | 상 |
| [Soju06/python-kis](https://github.com/Soju06/python-kis) | 288 | 2026-02-21 | 한국투자증권 REST/WebSocket 비공식 Python 라이브러리(국내·해외 시세·주문·잔고, 복구형 웹소켓) | 아니오 | 예 | 공식 | 중 |
| [koreainvestment/kis-ai-extensions](https://github.com/koreainvestment/kis-ai-extensions) | 218 | 2026-06-24 | KIS Open API를 Claude Code·Cursor·Codex·Gemini CLI에서 자연어로 쓰게 하는 공… | 예 | 예 | 공식 | 중 |
| [sharebook-kr/pykiwoom](https://github.com/sharebook-kr/pykiwoom) | 112 | 2025-07-09 | 키움증권 OpenAPI+(구형 Windows COM/OCX 방식) Python 래퍼 | 아니오 | 예 | 공식 | 하 |
| [sharebook-kr/mojito](https://github.com/sharebook-kr/mojito) | 92 | 2024-02-20 | 한국 증권사 REST Open API 통합 Python 래퍼(실제로는 한국투자증권 중심) | 아니오 | 예 | 공식 | 하 |
| [Kiwoom-Securities/Kiwoom-REST-API](https://github.com/Kiwoom-Securities/Kiwoom-REST-API) | 65 | 2026-09-15 | 키움증권 공식 REST API 클라이언트·샘플·CLI(kwcli)·MCP 서버 | 아니오 | 예 | 공식 | 중 |

## 우리가 가져다 쓸 것

| 순서 | 무엇 | 왜 | 비용 |
|---|---|---|---|
| 1 | 증권사 공식 API로 **주문 초안 자동 생성** (보내기 전 사람이 확인) | 매일 수량 계산·입력 실수를 없앤다 | 계좌 증권사 확인, API 키 발급, 실주문은 별도 승인 |
| 2 | vectorbt 교차 검증을 1년에 한 번 함께 실행 | 우리 계산이 틀어지지 않았는지 독립 확인 | 이미 스크립트 있음 |
| 3 | (선택) backtesting.py로 '다음 날 시가 체결' 민감도 | 종가 체결이 안 될 때 성과 차이 확인 | 반나절 |

LLM 분석 도구와 암호화폐 봇은 이 전략에 쓸 이유가 없다.

## 확인하지 못한 것

- QLD를 한국투자·키움 API로 실제 주문할 수 있는지 (실호출 안 함)
- 각 프레임워크의 비용·체결 모델 세부, KIS 백테스터의 미국 종목·세금 지원
- LLM 도구들의 수익률 주장 (모두 작성자 주장, 독립 재현 안 함)
