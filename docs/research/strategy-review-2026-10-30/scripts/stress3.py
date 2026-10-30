import sys; sys.path.insert(0,'.')
from stress import *
import indep
indep.real['UPRO'] = load('UPRO','adj')
def lev_series(c, L, rate, drag=0.01):
    r = c.pct_change().fillna(0)
    rt = rate.reindex(c.index, method='ffill').bfill() if rate is not None else pd.Series(0.0, index=c.index)
    return (1 + L*r - ((L-1)*rt/100 + drag*(L>1))/252).cumprod()
def blend_curve(a, b):
    j = a.index.intersection(b.index); ra, rb = a[j].pct_change().fillna(0), b[j].pct_change().fillna(0)
    va, vb, out = .5, .5, []
    for t, d in enumerate(j):
        if t: va *= 1+ra.iloc[t]; vb *= 1+rb.iloc[t]
        v = va+vb; out.append(v)
        if t < len(j)-1 and j[t+1].year != d.year: va, vb = v/2, v/2
    return pd.Series(out, index=j)
def row(name, c, rate, start):
    one = lev_series(c, 1, rate, 0.002); res = {}
    for L in [3, 2]:
        px = lev_series(c, L, rate); res[L] = evaluate(sim(px, lag_onto(px, target(c))), start=start)
    h = evaluate(sim(one, pd.Series(1.0, index=one.index)), start=start)
    b = blend_curve(res[3]['curve'], h['curve'])
    cg = (b.iloc[-1]/b.iloc[0])**(365.25/(b.index[-1]-b.index[0]).days)-1; md = (b/b.cummax()-1).min()
    f = lambda x, y: f"{x:6.1%}/{y:6.1%}"
    print(f"{name:22s} {start} | 1배 {f(h['cagr'],h['mdd'])} | 3배규칙 {f(res[3]['cagr'],res[3]['mdd'])} | 2배규칙 {f(res[2]['cagr'],res[2]['mdd'])} | 3배규칙50+1배50 {f(cg,md)}")
def tr(c, div): return (1 + c.pct_change().fillna(0) + div/252).cumprod()*c.iloc[0]
if __name__ == '__main__':
    print('시장                   시작        | CAGR/MDD 세후 (지수 배당 근사, 차입금리 ^IRX, 3배·2배 보수 1%)')
    ndx_tr = tr(ndx, 0.007); row('나스닥100', ndx_tr, irx, '1995-03-01'); row('나스닥100', ndx_tr, irx, '1986-08-01')
    row('S&P500', tr(load('_GSPC','close'), 0.02), irx, '1995-03-01')
    n = yahoo('dl/N225.json'); n = n[n.index>='1984-01-01']; row('닛케이225', tr(n, 0.013), irx, '1990-01-01'); row('닛케이225 (금리 0)', tr(n, 0.013), None, '1990-01-01')
    row('코스피', tr(yahoo('dl/KS11.json'), 0.015), irx, '1998-04-09')
    h = yahoo('dl/HSI.json'); row('항셍', tr(h[h.index>='1987-11-02'], 0.035), irx, '1989-02-16')
    row('FTSE100', tr(yahoo('dl/FTSE.json'), 0.037), irx, '1985-04-09')
    row('DAX(총수익)', yahoo('dl/GDAXI.json'), irx, '1989-04-10')
