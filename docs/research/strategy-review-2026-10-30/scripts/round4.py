"""사전 선언(preregistration.md) 후보 평가. indep.py 의 독립 구현을 쓴다."""
import sys; sys.path.insert(0, '.')
from indep import *

FEE = 0.0009
tq, _ = spliced('TQQQ', 3)
qld, _ = spliced('QLD', 2)
qqq, _ = spliced('QQQ', 1)
spy, _ = spliced('SPY', 1, index=load('_GSPC', 'close'))
rate = irx.reindex(tq.index, method='ffill').bfill()

def sim_mask(px, w, mask, fee=FEE):
    """mask=True 인 날에만 목표 비중 w 로 맞춘다 (정적 비중·정기 리밸런싱용)"""
    cash, sh, eqs, shs = 1.0, 0.0, [], []
    for t, p in enumerate(px.values):
        if mask[t]:
            eq = cash + sh * p
            tgt = w * eq / p
            if tgt > sh: tgt = sh + (tgt - sh) / (1 + fee)
            n = abs(tgt - sh) * p
            if n > 1e-12: cash = eq - tgt * p - n * fee; sh = tgt
        eqs.append(cash + sh * p); shs.append(sh)
    return pd.DataFrame({'p': px.values, 'eq': eqs, 'sh': shs}, index=px.index)

def first_of(px, freq):
    key = px.index.year if freq == 'Y' else px.index.year * 10 + (px.index.month - 1) // 3
    k = pd.Series(key, index=px.index)
    return (k != k.shift()).values

def hysteresis(c, band=0.05):
    raw = ensemble(c) * volscale(c)
    out, T = [], 0.0
    for x in raw.values:
        if abs(x - T) >= 0.1 + band - 1e-12: T = jsround(x * 5) / 5
        out.append(T)
    return pd.Series(out, index=c.index)

def nine_sig(px, start='1995-03-01', fee=FEE):
    """TQQQ/현금. 분기 첫 거래일에 TQQQ 잔고 목표 = 직전 분기 리밸런싱 후 잔고 × 1.09. 현금은 ^IRX 이자(세후 84.6%)"""
    px = px[px.index >= start]; r = rate[px.index]
    q = first_of(px, 'Q')
    cash, sh, line = 0.4, 0.6 / px.iloc[0] / (1 + fee), None
    cash = 1 - sh * px.iloc[0] * (1 + fee)
    eqs, shs = [], []
    for t, p in enumerate(px.values):
        if t: cash *= 1 + r.iloc[t] / 100 / 252 * (1 - 0.154)
        if q[t] and t:
            line = line * 1.09 if line is not None else sh * px.values[0] * 1.09
            bal = sh * p
            if bal > line:   # 초과분 매도
                d = (bal - line) / p; sh -= d; cash += d * p * (1 - fee)
            elif bal < line: # 부족분 매수 (현금 한도)
                buy = min(line - bal, cash / (1 + fee)); sh += buy / p; cash -= buy * (1 + fee)
            line = sh * p    # 다음 분기 기준 = 실제 리밸런싱 후 잔고
        eqs.append(cash + sh * p); shs.append(sh)
    return pd.DataFrame({'p': px.values, 'eq': eqs, 'sh': shs}, index=px.index)

def trades_per_year(run, start='1995-03-01'):
    r = run[run.index >= start]
    n = int((r.sh.diff().abs() > 1e-9 * r.sh.abs().clip(lower=1e-12)).sum())
    return n / ((r.index[-1] - r.index[0]).days / 365.25)

def row(name, run, taxed=True):
    f = evaluate(run, taxed=taxed); o = evaluate(run, end='2010-03-10', taxed=taxed); l = evaluate(run, start='1986-08-01', taxed=taxed) if run.index[0] < pd.Timestamp('1986-08-01') else None
    s10 = evaluate(run, start='2010-03-11', taxed=taxed)
    print(f"{name:34s} 1995~ {f['cagr']:6.1%} MDD {f['mdd']:6.1%} Sh {f['sharpe']:.2f} | 95~10 {o['cagr']:6.1%} MDD {o['mdd']:6.1%} | 2010~ {s10['cagr']:6.1%} MDD {s10['mdd']:6.1%} | "
          + (f"1986~ {l['cagr']:6.1%} MDD {l['mdd']:6.1%} | " if l else "") + f"매매일/년 {trades_per_year(run):5.1f} 평균비중 {f['avg_exp']:.2f}")
    return f

cur_t = target(ndx)
cur = sim(tq, lag_onto(tq, cur_t))
print('--- 기준 ---')
row('현행 TQQQ+필터', cur)
row('현행 TQQQ+필터 (세전)', cur, taxed=False)
row('현행 + 앱 10%p 드리프트 규칙', sim(tq, lag_onto(tq, cur_t), drift_band=0.1))
print('--- 1·2 통제군 ---')
avg = evaluate(cur)['avg_exp']
for w in [round(avg, 3), 0.5, 1/3]:
    row(f'TQQQ 고정 {w:.0%} 연1회 리밸런싱', sim_mask(tq, w, first_of(tq, 'Y')))
row('QLD 그냥 보유', sim_mask(qld, 1.0, np.arange(len(qld)) == 0))
row('QQQ 그냥 보유', sim_mask(qqq, 1.0, np.arange(len(qqq)) == 0))
row('SPY 그냥 보유', sim_mask(spy, 1.0, np.arange(len(spy)) == 0))
print('--- 3 변동성 필터만 ---')
vo = (volscale(ndx)).apply(lambda x: jsround(x * 5) / 5)
row('TQQQ 변동성 필터만', sim(tq, lag_onto(tq, vo)))
print('--- 4 히스테리시스 ---')
row('현행 + 히스테리시스 ±5%p', sim(tq, lag_onto(tq, hysteresis(ndx))))
print('--- 5 9-Sig 단순판 ---')
row('9-Sig (TQQQ/현금)', nine_sig(tq))
print('--- 6 ISA 상한 (세금 0) ---')
row('QLD + 필터 (세전)', sim(qld, lag_onto(qld, cur_t)), taxed=False)
row('QLD 기본 앙상블 (세전)', sim(qld, lag_onto(qld, target(ndx, filt=False))), taxed=False)
