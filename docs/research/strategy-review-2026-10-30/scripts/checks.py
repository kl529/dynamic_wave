"""보고서의 나머지 점검 (indep.py 독립 구현 사용). 실행: 이 폴더에서 python3 -I checks.py
- 합성 구간 배당 편향 민감도, 연 회전율, 목표 비중 변경 빈도·왕복 비율, 1987년 노출, S&P500(UPRO 보정 합성) 적용
- app_targets.json(appsig.ts 결과)이 있으면 앱 신호와 전 기간 비교
"""
import os, json, sys; sys.path.insert(0, ".")
from indep import *
import indep

tq, _ = spliced('TQQQ', 3)
tgt = target(ndx)

print('[합성 구간 배당 편향] 상장 전 구간에 추가 drag')
for extra in [0, 0.01, 0.021, 0.03]:
    s, _ = spliced('TQQQ', 3, extra_pre=extra)
    run = sim(s, lag_onto(s, tgt))
    f, o = evaluate(run), evaluate(run, end='2010-03-10')
    print(f"  +{extra:.1%}: 1995~ {f['cagr']:.1%} MDD {f['mdd']:.1%} | 1995~2010 {o['cagr']:.1%}")

run = sim(tq, lag_onto(tq, tgt)); r = run[run.index >= '1995-03-01']
yrs = (r.index[-1] - r.index[0]).days / 365.25
print('[연 회전율] %.2f배' % (((r.sh.diff().abs() * r.p).fillna(0) / r['eq']).sum() / yrs))

t = tgt[tgt.index >= '1995-03-01']; v = t.values; idx = np.flatnonzero(v[1:] != v[:-1]) + 1
rev = sum(1 for k in range(len(idx) - 1) if idx[k + 1] - idx[k] <= 5 and v[idx[k + 1]] == v[idx[k] - 1])
print(f'[목표 변경] {len(idx)}건, 5거래일 안에 되돌아간 변경 {rev}건 ({rev / len(idx):.0%})')

e, nr = lag_onto(tq, tgt), ndx.pct_change()
print('[1987-10] ' + ', '.join(f"{d} NDX {nr[d]:+.1%} 노출 {e[d]:.1f}" for d in ['1987-10-16', '1987-10-19', '1987-10-20', '1987-10-26']))

indep.real['UPRO'] = load('UPRO', 'adj')
gspc = load('_GSPC', 'close'); up, _ = spliced('UPRO', 3, index=gspc); spy, _ = spliced('SPY', 1, index=gspc)
for st in ['1995-03-01', '1986-08-01']:
    a = evaluate(sim(up, lag_onto(up, target(gspc))), start=st); c = evaluate(sim(spy, pd.Series(1.0, index=spy.index)), start=st)
    print(f"[S&P500 같은 규칙, UPRO 보정 합성] {st}~ 규칙 {a['cagr']:.1%}/{a['mdd']:.1%} | SPY 보유 {c['cagr']:.1%}/{c['mdd']:.1%}")

if os.path.exists('app_targets.json'):
    app = pd.Series({pd.Timestamp(d): x for d, x in json.load(open('app_targets.json'))})
    j = app.index.intersection(tgt.index)
    print(f"[앱 신호 비교] {len(j)}일 중 불일치 {int(((app[j] - tgt[j]).abs() > 1e-9).sum())}일")
