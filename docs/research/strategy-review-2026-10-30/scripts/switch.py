"""5차: 전략 100% ↔ 70/30 전환 규칙 평가 (preregistration-switch.md). 실행: 이 폴더에서 python3 -I switch.py"""
import sys; sys.path.insert(0, '.')
from indep import *
from stress import yahoo
from stress3 import lev_series, tr

FEE = 0.0025

def meta(a, b, w_target, fee=FEE):
    """a=전략 곡선, b=1배 곡선(세후). w_target[t]=그날 종가에 맞출 전략 비중. 목표가 바뀐 날과 매년 첫 거래일에 맞춘다."""
    j = a.index.intersection(b.index)
    ra, rb, w = a[j].pct_change().fillna(0).values, b[j].pct_change().fillna(0).values, w_target.reindex(j).ffill().fillna(1.0).values
    va, vb, cur, out, sw = w[0], 1 - w[0], w[0], [], 0
    for t in range(len(j)):
        if t: va *= 1 + ra[t]; vb *= 1 + rb[t]
        v = va + vb
        new_year = t and j[t].year != j[t - 1].year
        if t and (w[t] != cur or new_year):
            if w[t] != cur: sw += 1
            move = abs(v * w[t] - va); v -= move * fee * 2
            va, vb, cur = v * w[t], v * (1 - w[t]), w[t]
        out.append(v)
    return pd.Series(out, index=j), sw

def monthly(sig_daily, idx):
    """월말 값으로 정한 비중을 다음 거래일부터 적용"""
    s = sig_daily.reindex(idx).ffill()
    me = pd.Series(idx, index=idx).groupby([idx.year, idx.month]).transform('max')
    dec = s.where(pd.Series(idx, index=idx) == me)
    return dec.ffill().shift(1).fillna(1.0)

def stat(c, sw=0):
    yrs = (c.index[-1] - c.index[0]).days / 365.25; r = c.pct_change().dropna()
    return {'cagr': (c.iloc[-1] / c.iloc[0]) ** (1 / yrs) - 1, 'mdd': (c / c.cummax() - 1).min(), 'sh': r.mean() / r.std() * 252 ** .5, 'sw': sw / yrs}

def oracle(a, b):
    """참고용: 매년 그해 결과를 미리 알고 100% / 70/30 중 나은 쪽 선택 (실현 불가)"""
    j = a.index.intersection(b.index); w = pd.Series(1.0, index=j)
    for y in sorted(set(j.year)):
        m = j.year == y; ya, yb = a[j][m], b[j][m]
        p = j[j.year == y - 1]
        base_a, base_b = (a[p[-1]], b[p[-1]]) if len(p) else (ya.iloc[0], yb.iloc[0])
        ret = lambda wt: wt * ya.iloc[-1] / base_a + (1 - wt) * yb.iloc[-1] / base_b
        w[m] = 1.0 if ret(1.0) >= ret(0.7) else 0.7
    return w

def candidates(a, b, idx_close, tgt, rel=None):
    j = a.index.intersection(b.index)
    out = {'고정 100%': pd.Series(1.0, index=j), '고정 85/15': pd.Series(0.85, index=j), '고정 70/30': pd.Series(0.7, index=j)}
    if rel is not None: out['R1 상대 강도'] = monthly(rel, j)
    out['R2 전략 자기 추세'] = monthly((a > a.rolling(200).mean()).map({True: 1.0, False: 0.7}).where(a.rolling(200).mean().notna(), 1.0), j)
    out['R3 쉬는 구간 메우기'] = monthly((tgt <= 0.4).map({True: 0.7, False: 1.0}), j)
    out['(참고) 결과를 미리 안 경우'] = oracle(a, b)
    return out

def table(a, b, cands, periods):
    res = {}
    for name, w in cands.items():
        row = []
        for s, e in periods:
            aa, bb = a[s:e] / a[s:e].iloc[0], b[s:e] / b[s:e].iloc[0]
            c, sw = meta(aa, bb, w[s:e]); row.append(stat(c, sw))
        res[name] = row
    return res

if __name__ == '__main__':
    tq, _ = spliced('TQQQ', 3); spy, _ = spliced('SPY', 1, index=load('_GSPC', 'close'))
    tgt = target(ndx)
    a = evaluate(sim(tq, lag_onto(tq, tgt), FEE), start='1986-08-01')['curve']
    b = evaluate(sim(spy, pd.Series(1.0, index=spy.index)), start='1986-08-01')['curve']
    gspc = load('_GSPC', 'close')
    rel = (ndx.pct_change(252) > gspc.reindex(ndx.index).ffill().pct_change(252)).map({True: 1.0, False: 0.7})
    P = [('1986-08-01', '2010-03-10'), ('2010-03-11', '2026-12-31'), ('1995-03-01', '2026-12-31'), ('1986-08-01', '2026-12-31')]
    res = table(a, b, candidates(a, b, ndx, tgt, rel), P)
    print('나스닥100 (세후, 수수료 0.25%, 전환 때 양도세 제외) — CAGR / MDD / Sharpe / 전환 횟수(연)')
    print(f"{'':28s}" + ''.join(f'{s[:7]}~{e[:7] if e < "2026-12" else "현재":>7s}            ' for s, e in P))
    for k, row in res.items():
        print(f'{k:28s}' + ''.join(f"{x['cagr']:6.1%} {x['mdd']:6.1%} {x['sh']:.2f} {x['sw']:4.1f} | " for x in row))
    # 판정 1·2 (두 구간)
    print('\n판정 (1986~2010, 2010~ 두 구간):')
    for k in ['R1 상대 강도', 'R2 전략 자기 추세', 'R3 쉬는 구간 메우기']:
        ok1 = all(res[k][i]['sh'] > max(res['고정 100%'][i]['sh'], res['고정 70/30'][i]['sh']) for i in (0, 1))
        ok2 = all(res[k][i]['cagr'] >= res['고정 70/30'][i]['cagr'] and res[k][i]['mdd'] >= res['고정 100%'][i]['mdd'] for i in (0, 1))
        print(f'  {k}: ① Sharpe 둘 다보다 높음 {"✅" if ok1 else "❌"}  ② 나쁜 쪽보다 나음 {"✅" if ok2 else "❌"}')

    # 판정 3: 다른 시장 (3배 규칙 + 같은 지수 1배)
    print('\n다른 시장 (3배 규칙 + 같은 지수 1배, 전체 구간 Sharpe / CAGR / MDD)')
    n = yahoo('dl/N225.json'); n = n[n.index >= '1984-01-01']; h = yahoo('dl/HSI.json')
    mk = [('S&P500', tr(load('_GSPC', 'close'), 0.02), '1995-03-01'), ('닛케이', tr(n, 0.013), '1990-01-01'),
          ('코스피', tr(yahoo('dl/KS11.json'), 0.015), '1998-04-09'), ('항셍', tr(h[h.index >= '1987-11-02'], 0.035), '1989-02-16'),
          ('FTSE100', tr(yahoo('dl/FTSE.json'), 0.037), '1985-04-09'), ('DAX', yahoo('dl/GDAXI.json'), '1989-04-10')]
    wins = {'R2 전략 자기 추세': 0, 'R3 쉬는 구간 메우기': 0}
    for name, c, st in mk:
        lev, one = lev_series(c, 3, irx), lev_series(c, 1, irx, 0.002)
        t = target(c)
        aa = evaluate(sim(lev, lag_onto(lev, t), FEE), start=st)['curve']; bb = evaluate(sim(one, pd.Series(1.0, index=one.index)), start=st)['curve']
        r = table(aa, bb, {k: v for k, v in candidates(aa, bb, c, t).items() if not k.startswith('(')}, [(st, '2026-12-31')])
        for k in wins: wins[k] += r[k][0]['sh'] >= r['고정 85/15'][0]['sh']
        print(f'  {name:8s} ' + ' | '.join(f"{k.split()[0]} {v[0]['sh']:.2f} {v[0]['cagr']:5.1%} {v[0]['mdd']:6.1%}" for k, v in r.items()))
    for k, v in wins.items(): print(f'  {k}: 고정 85/15 이상인 시장 {v}/6 → ③ {"✅" if v >= 4 else "❌"}')
