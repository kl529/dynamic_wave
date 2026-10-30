"""TS 코드를 쓰지 않는 독립 재구현: TQQQ 추세 앙상블 + 변동성 필터 (1995-03 ~, 세후, 수수료 0.09%)."""
import json, math, bisect, sys
import numpy as np, pandas as pd

C = '/Users/lyvakim/personal/side_projects/dongpa/scripts/research/.cache'
def load(sym, field):
    d = json.load(open(f'{C}/{sym}.json'))
    return pd.Series([b[field] for b in d], index=pd.to_datetime([b['date'] for b in d]), name=sym)

ndx, irx = load('_NDX', 'close'), load('_IRX', 'close')
real = {s: load(s, 'adj') for s in ['TQQQ', 'QLD', 'QQQ', 'SPY']}
PER = [100, 150, 200, 250, 300]

def synth(index, L, drag, rate):
    r = index.pct_change().fillna(0)
    rt = rate.reindex(index.index, method='ffill').bfill()
    daily = 1 + L * r - ((L - 1) * rt / 100 + drag) / 252
    daily.iloc[0] = 1
    return daily.cumprod()

def cagr(s):
    yrs = (s.index[-1] - s.index[0]).days / 365.25
    return (s.iloc[-1] / s.iloc[0]) ** (1 / yrs) - 1

def calibrate(index, L, realS, rate):
    idx = index[index.index >= realS.index[0]]
    tgt = cagr(realS)
    lo, hi = -0.1, 0.2
    for _ in range(60):
        mid = (lo + hi) / 2
        if cagr(synth(idx, L, mid, rate)) > tgt: lo = mid
        else: hi = mid
    return (lo + hi) / 2

def spliced(sym, L, index=ndx, extra_pre=0.0, pre_until='2010-02-11'):
    rs = real[sym]
    drag = calibrate(index, L, rs, irx)
    sy = synth(index, L, drag, irx)
    if extra_pre:  # 상장 전 구간에만 추가 drag (배당수익률 시대 차이 민감도)
        r = sy.pct_change().fillna(0)
        r[r.index < pre_until] -= extra_pre / 252
        r.iloc[0] = 0
        sy = (1 + r).cumprod()
    k = rs.iloc[0] / sy[rs.index[0]]
    return pd.concat([sy[sy.index < rs.index[0]] * k, rs]), drag

def ensemble(c, periods=PER):
    return sum(((c > c.rolling(n).mean()) & c.rolling(n).mean().notna()).astype(float) for n in periods) / len(periods)

def volscale(c, n=20, minN=250):
    vol = np.log(c).diff().rolling(n).std(ddof=1) * math.sqrt(252)
    srt, out = [], []
    for v in vol.values:
        if not np.isnan(v): bisect.insort(srt, v)
        med = srt[len(srt) // 2] if len(srt) > minN else np.nan
        out.append(1.0 if (np.isnan(med) or not v > 0) else min(1.0, med / v))
    return pd.Series(out, index=c.index)

def jsround(x): return math.floor(x + 0.5)

def target(c, filt=True, step=5, periods=PER, n=20):
    e = ensemble(c, periods)
    if filt: e = e * volscale(c, n)
    return e.apply(lambda x: jsround(x * step) / step)

def lag_onto(traded, sig):
    # traded 날짜 t에는 t보다 앞선 마지막 신호 날짜 값
    s = sig.copy(); s.index = s.index + pd.Timedelta(microseconds=1)
    return s.reindex(traded.index.union(s.index)).ffill().reindex(traded.index).fillna(0)

def sim(px, exp, fee=0.0009, drift_band=None):
    cash, sh = 1.0, 0.0
    eqs, shs = [], []
    p_arr, e_arr = px.values, exp.values
    for t in range(len(p_arr)):
        p = p_arr[t]
        eq = cash + sh * p
        trade = t == 0 or e_arr[t] != e_arr[t - 1]
        if drift_band is not None and eq > 0 and abs(sh * p / eq - e_arr[t]) >= drift_band: trade = True
        if trade:
            tgt = e_arr[t] * eq / p
            if tgt > sh: tgt = sh + (tgt - sh) / (1 + fee)
            notional = abs(tgt - sh) * p
            if notional > 1e-12:
                cash = eq - tgt * p - notional * fee; sh = tgt
        eqs.append(cash + sh * p); shs.append(sh)
    return pd.DataFrame({'p': p_arr, 'eq': eqs, 'sh': shs}, index=px.index)

def tax(run, rate=0.22):
    scale, avg, realized = 1.0, 0.0, 0.0
    out = []
    d, sh, p, eq = run.index, run.sh.values, run.p.values, run['eq'].values
    for t in range(len(d)):
        prev = sh[t - 1] if t else 0.0
        if sh[t] < prev: realized += (prev - sh[t]) * (p[t] - avg)
        elif sh[t] > prev: avg = (prev * avg + (sh[t] - prev) * p[t]) / sh[t]
        if sh[t] <= 1e-12: avg = 0
        ye = t == len(d) - 1 or d[t + 1].year != d[t].year
        if ye and t < len(d) - 1:
            tx = max(0, realized) * rate
            scale *= 1 - tx / eq[t]; realized = 0
        out.append(eq[t] * scale)
    final_tax = max(0, realized + sh[-1] * (p[-1] - avg)) * rate * scale
    curve = pd.Series(out, index=d)
    return curve, curve.iloc[-1] - final_tax

def evaluate(run, start='1995-03-01', end=None, taxed=True):
    r = run[run.index >= start]
    if end: r = r[r.index <= end]
    r = r.copy(); k = 1 / r['eq'].iloc[0]; r['eq'] *= k; r['sh'] *= k
    if taxed: curve, final = tax(r)
    else: curve, final = r['eq'], r['eq'].iloc[-1]
    yrs = (r.index[-1] - r.index[0]).days / 365.25
    dd = curve / curve.cummax() - 1
    dr = curve.pct_change().dropna()
    return {'cagr': final ** (1 / yrs) - 1, 'mdd': dd.min(), 'sharpe': dr.mean() / dr.std(ddof=0) * math.sqrt(252),
            'avg_exp': float((r.sh * r.p / r['eq']).mean()), 'curve': curve, 'final': final}

if __name__ == '__main__':
    tq, drag = spliced('TQQQ', 3)
    tgt = target(ndx)
    exp = lag_onto(tq, tgt)
    run = sim(tq, exp)
    e = evaluate(run)
    print(f"drag={drag:.4%}  TQQQ+필터 세후 CAGR={e['cagr']:.4%} MDD={e['mdd']:.4%} Sharpe={e['sharpe']:.3f} 평균비중={e['avg_exp']:.3f}")
    e0 = evaluate(run, taxed=False)
    print(f"세전 CAGR={e0['cagr']:.4%} MDD={e0['mdd']:.4%}")
    base = evaluate(sim(tq, lag_onto(tq, target(ndx, filt=False))))
    print(f"TQQQ 기본 세후 CAGR={base['cagr']:.4%} MDD={base['mdd']:.4%}")
