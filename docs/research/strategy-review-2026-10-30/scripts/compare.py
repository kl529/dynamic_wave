"""현행 전략 100% vs 전략 50% + S&P500 50% (매년 초 리밸런싱) 상세 비교. 세후(청산세 제외) 곡선 기준."""
import sys; sys.path.insert(0, '.')
from indep import *
tq, _ = spliced('TQQQ', 3); spy, _ = spliced('SPY', 1, index=load('_GSPC', 'close')); qqq, _ = spliced('QQQ', 1)
exp = lag_onto(tq, target(ndx))
def blend(a, b, w=0.5):
    j = a.index.intersection(b.index); ra, rb = a[j].pct_change().fillna(0), b[j].pct_change().fillna(0)
    va, vb, out = w, 1 - w, []
    for t, d in enumerate(j):
        if t: va *= 1 + ra.iloc[t]; vb *= 1 + rb.iloc[t]
        v = va + vb; out.append(v)
        if t < len(j) - 1 and j[t + 1].year != d.year: va, vb = v * w, v * (1 - w)
    return pd.Series(out, index=j)
def dd_list(c, th):
    out, peak, pk_d, trough, inn = [], c.iloc[0], c.index[0], 0, False
    for d, v in c.items():
        if v >= peak:
            if inn: out.append((pk_d, trough, d))
            peak, pk_d, trough, inn = v, d, 0, False
        else:
            trough = min(trough, v / peak - 1); inn = inn or trough <= -th
    if inn: out.append((pk_d, trough, None))
    return out
def describe(c):
    yrs = (c.index[-1] - c.index[0]).days / 365.25; r = c.pct_change().dropna()
    y = c.groupby(c.index.year).last(); y = pd.concat([pd.Series([c.iloc[0]], index=[c.index[0].year - 1]), y]).pct_change().dropna()
    dds = dd_list(c, 0.3); rec = max(((e or c.index[-1]) - p).days / 30.44 for p, _, e in dd_list(c, 0.0001))
    m = c.resample('ME').last(); r10 = ((m.shift(-120) / m) ** 0.1 - 1).dropna()
    return {'CAGR': (c.iloc[-1] / c.iloc[0]) ** (1 / yrs) - 1, 'MDD': (c / c.cummax() - 1).min(), 'Sharpe': r.mean() / r.std() * 252 ** .5,
            '변동성': r.std() * 252 ** .5, '최악 연도': y.min(), '최고 연도': y.max(), '손실 연도': int((y < 0).sum()), '연도 수': len(y),
            '-30% 하락': len(dds), '-20% 아래 시간': float(((c / c.cummax() - 1) <= -0.2).mean()), '최장 회복(개월)': rec,
            '10년 최저': r10.min(), '10년 중앙': r10.median(), '1억 →': c.iloc[-1] / c.iloc[0]}
for fee in [0.0025, 0.0009]:
    strat = evaluate(sim(tq, exp, fee), start='1986-08-01')['curve']
    sp = evaluate(sim(spy, pd.Series(1.0, index=spy.index)), start='1986-08-01')['curve']
    qq = evaluate(sim(qqq, pd.Series(1.0, index=qqq.index)), start='1986-08-01')['curve']
    for start in ['1995-03-01', '1986-08-01', '2010-03-11']:
        cs = {'전략 100%': strat, '전략 50 + S&P 50': blend(strat, sp), '전략 70 + S&P 30': blend(strat, sp, 0.7), 'S&P500 100%': sp, '나스닥100 1배': qq}
        cs = {k: v[v.index >= start] / v[v.index >= start].iloc[0] for k, v in cs.items()}
        rows = {k: describe(v) for k, v in cs.items()}
        print(f'\n=== 수수료 {fee:.2%} · {start} ~ 2026-10-29 ===')
        df = pd.DataFrame(rows)
        for k in df.index:
            f = (lambda x: f'{x:.0f}') if k in ('손실 연도', '연도 수', '-30% 하락', '최장 회복(개월)') else (lambda x: f'{x:.2f}') if k == 'Sharpe' else (lambda x: f'{x:,.1f}억') if k == '1억 →' else (lambda x: f'{x:.1%}')
            print(f'{k:12s} ' + ' | '.join(f'{f(df.loc[k, c]):>10s}' for c in df.columns))
    if fee == 0.0025:
        b = blend(strat, sp); print('\n위기 구간 낙폭 (수수료 0.25%, 구간 안 최대 낙폭)')
        for a, z, name in [('2000-03-01', '2002-12-31', '닷컴'), ('2007-10-01', '2009-06-30', '금융위기'), ('2020-02-01', '2020-06-30', '코로나'), ('2021-11-01', '2023-06-30', '2022 긴축'), ('2025-10-01', '2026-10-29', '2025-26')]:
            g = lambda c: (c[a:z] / c[a:z].cummax() - 1).min()
            print(f'  {name:8s} 전략100 {g(strat):6.1%} | 50/50 {g(b):6.1%} | S&P {g(sp):6.1%} | 나스닥1배 {g(qq):6.1%}')
