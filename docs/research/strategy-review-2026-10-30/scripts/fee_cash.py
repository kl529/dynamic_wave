"""수수료 0.25%(나무증권 온라인 기본)와 달러 예수금 이용료 연 0.8%(세후 84.6%)를 넣은 현행 전략과 50/50 혼합"""
import sys; sys.path.insert(0, '.')
from indep import *
tq, _ = spliced('TQQQ', 3); spy, _ = spliced('SPY', 1, index=load('_GSPC', 'close'))
exp = lag_onto(tq, target(ndx))
def sim_cash(px, e, fee, cash_rate):
    p = px.values  # 현금에 매일 이자를 붙이는 것 외에는 indep.sim 과 같다
    cash, sh_, eqs, shs = 1.0, 0.0, [], []
    ev = e.values
    for t, pt in enumerate(p):
        if t and cash > 0: cash *= 1 + cash_rate * (1 - 0.154) / 252
        eq = cash + sh_ * pt
        if t == 0 or ev[t] != ev[t - 1]:
            tgt = ev[t] * eq / pt
            if tgt > sh_: tgt = sh_ + (tgt - sh_) / (1 + fee)
            n = abs(tgt - sh_) * pt
            if n > 1e-12: cash = eq - tgt * pt - n * fee; sh_ = tgt
        eqs.append(cash + sh_ * pt); shs.append(sh_)
    return pd.DataFrame({'p': p, 'eq': eqs, 'sh': shs}, index=px.index)
def blend(a, b):
    j = a.index.intersection(b.index); ra, rb = a[j].pct_change().fillna(0), b[j].pct_change().fillna(0)
    va, vb, out = .5, .5, []
    for t, d in enumerate(j):
        if t: va *= 1 + ra.iloc[t]; vb *= 1 + rb.iloc[t]
        v = va + vb; out.append(v)
        if t < len(j) - 1 and j[t + 1].year != d.year: va, vb = v / 2, v / 2
    s = pd.Series(out, index=j)
    return (s.iloc[-1] / s.iloc[0]) ** (365.25 / (s.index[-1] - s.index[0]).days) - 1, (s / s.cummax() - 1).min()
sp = evaluate(sim(spy, pd.Series(1.0, index=spy.index)))
for fee, cr in [(0.0009, 0), (0.0025, 0), (0.0025, 0.008)]:
    e = evaluate(sim_cash(tq, exp, fee, cr))
    b = blend(e['curve'], sp['curve'])
    print(f"수수료 {fee:.2%} 현금이자 {cr:.1%}: 전략 100% {e['cagr']:.1%} / {e['mdd']:.1%} | 전략 50 + SPY 50 {b[0]:.1%} / {b[1]:.1%} (청산세 제외)")
