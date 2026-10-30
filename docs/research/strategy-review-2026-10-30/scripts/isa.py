"""ISA 가정: 국내 상장 나스닥100 2배(QLD 대용 + 국내 상품 추가 비용) + 같은 신호, 세금 없음(ISA 비과세·9.9% 분리과세는 만기에 한 번)"""
import sys, json, datetime; sys.path.insert(0, '.')
from indep import *
def adj(path):
    d = json.load(open(path))['chart']['result'][0]
    idx = pd.to_datetime([datetime.datetime.utcfromtimestamp(t).date() for t in d['timestamp']])
    s = pd.Series(d['indicators']['adjclose'][0]['adjclose'], index=idx).dropna(); return s[~s.index.duplicated(keep='last')]
# 1) 국내 2배 상품의 환율 민감도: 월간 수익률 = a + b1*QLD(달러) + b2*환율
q, fx = load('QLD', 'adj'), adj('dl/KRW.json')
for sym in ['409820.KS', '418660.KS']:
    k = adj(f'dl/{sym}.json').resample('ME').last().pct_change()
    m = pd.concat([k, q.resample('ME').last().pct_change(), fx.resample('ME').last().pct_change()], axis=1).dropna()
    X = np.c_[np.ones(len(m)), m.iloc[:, 1], m.iloc[:, 2]]; b = np.linalg.lstsq(X, m.iloc[:, 0], rcond=None)[0]
    print(f'{sym}: QLD 민감도 {b[1]:.2f}, 환율 민감도 {b[2]:.2f} ({len(m)}개월)')
# 2) 성과: QLD 합성에 국내 상품 추가 비용(연 1.2%p, 2021~2026 KODEX H 실측)을 더해 같은 신호로 운용
ql, _ = spliced('QLD', 2)
r = ql.pct_change().fillna(0) - 0.012 / 252; dom = (1 + r).cumprod()
spy, _ = spliced('SPY', 1, index=load('_GSPC', 'close')); tq, _ = spliced('TQQQ', 3)
def blend(a, b, w=0.5):
    j = a.index.intersection(b.index); ra, rb = a[j].pct_change().fillna(0), b[j].pct_change().fillna(0)
    va, vb, out = w, 1 - w, []
    for t, d in enumerate(j):
        if t: va *= 1 + ra.iloc[t]; vb *= 1 + rb.iloc[t]
        v = va + vb; out.append(v)
        if t < len(j) - 1 and j[t + 1].year != d.year: va, vb = v * w, v * (1 - w)
    return pd.Series(out, index=j)
def st(c):
    yrs = (c.index[-1] - c.index[0]).days / 365.25; d = c.pct_change().dropna()
    return f"{(c.iloc[-1]/c.iloc[0])**(1/yrs)-1:6.1%} / {(c/c.cummax()-1).min():6.1%} / {d.mean()/d.std()*252**.5:.2f}"
tgt = target(ndx)
isa = evaluate(sim(dom, lag_onto(dom, tgt), 0.0005), start='1986-08-01', taxed=False)['curve']
isa_spy = evaluate(sim(spy, pd.Series(1.0, index=spy.index)), start='1986-08-01', taxed=False)['curve']
ovs = evaluate(sim(tq, lag_onto(tq, tgt), 0.0025), start='1986-08-01')['curve']
ovs_spy = evaluate(sim(spy, pd.Series(1.0, index=spy.index)), start='1986-08-01')['curve']
rows = {'ISA: 국내 2배 + 같은 신호 100%': isa, 'ISA: 국내 2배 전략 50 + S&P 50': blend(isa, isa_spy),
        '해외: TQQQ 전략 100%': ovs, '해외: TQQQ 전략 50 + S&P 50': blend(ovs, ovs_spy), '해외: S&P500만': ovs_spy}
print('\nCAGR / MDD / Sharpe (해외는 양도세 22%·수수료 0.25%, ISA는 세금 0·수수료 0.05%·국내 상품 추가 비용 연 1.2%p)')
for s in ['1995-03-01', '1986-08-01', '2010-03-11']:
    print(f'== {s}~')
    for k, c in rows.items():
        c = c[c.index >= s]; print(f'  {k:28s} {st(c)}')
