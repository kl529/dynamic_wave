"""vectorbt(독립 오픈소스 엔진)로 QLD 추세 앙상블을 재현해 우리 하네스와 비교. 세금 제외(세전).
실행 (격리 환경 권장):
  uv venv /tmp/vbt && VIRTUAL_ENV=/tmp/vbt uv pip install vectorbt==0.28.1 "plotly<6"
  /tmp/vbt/bin/python -I scripts/research/crosscheck_vectorbt.py 2007-01-03 2026-10-29
먼저 bun scripts/research/run.ts 로 scripts/research/.cache 를 채워야 한다. 결과: docs/validation/crosscheck.md
"""
import json, sys
import numpy as np, pandas as pd, vectorbt as vbt
import os
C = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache')
def load(sym, field):
    d = json.load(open(f'{C}/{sym}.json'))
    return pd.Series([b[field] for b in d], index=pd.to_datetime([b['date'] for b in d]))
ndx, qld, spy = load('_NDX', 'close'), load('QLD', 'adj'), load('SPY', 'adj')
periods = [100, 150, 200, 250, 300]
ens = sum((ndx > ndx.rolling(n).mean()).astype(float) for n in periods) / len(periods)
ens[ndx.rolling(max(periods)).mean().isna()] = np.nan
target = ens.reindex(qld.index, method='ffill').shift(1)          # t-1 종가 신호 → t 종가 체결
start, end = sys.argv[1], sys.argv[2]
target, price = target[start:end], qld[start:end]
size = target.where(target != target.shift(1))                    # 목표가 바뀐 날만 주문
size.iloc[0] = target.iloc[0]
pf = vbt.Portfolio.from_orders(price, size=size, size_type='targetpercent', fees=0.0004678, init_cash=10000, freq='1D')
v = pf.value()
yrs = (v.index[-1] - v.index[0]).days / 365.25
print(json.dumps({'cagr': (v.iloc[-1] / v.iloc[0]) ** (1 / yrs) - 1, 'mdd': float((v / v.cummax() - 1).min()),
                  'final': float(v.iloc[-1]), 'orders': int(pf.orders.count()), 'from': str(v.index[0].date()), 'to': str(v.index[-1].date())}))
