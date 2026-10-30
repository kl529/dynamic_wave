"""스트레스 테스트: 같은 규칙(3배 + 추세 앙상블 + 변동성 필터)을 나스닥 밖 지수에 적용.
나스닥100이 지난 40년 유난히 강했던 운을 빼면 규칙이 어떻게 되는지 본다. 채택 판정용이 아니다."""
import sys, json, datetime; sys.path.insert(0, '.')
from indep import *

def yahoo(path):
    d = json.load(open(path))['chart']['result'][0]
    idx = [datetime.datetime.utcfromtimestamp(t).date() for t in d['timestamp']]
    s = pd.Series(d['indicators']['quote'][0]['close'], index=pd.to_datetime(idx)).dropna()
    return s[~s.index.duplicated(keep='last')]

def run_index(name, c, rate=None, drag=0.01, eval_from=None):
    r = c.pct_change()
    big = r[r.abs() > 0.15]
    rt = (rate.reindex(c.index, method='ffill').bfill() if rate is not None else pd.Series(0.0, index=c.index))
    lev = (1 + 3 * r.fillna(0) - (2 * rt / 100 + drag) / 252).cumprod()
    one = c / c.iloc[0]
    start = eval_from or str(c.index[320].date())
    out = {}
    for label, px, exp in [('3배+추세+필터', lev, lag_onto(lev, target(c))),
                           ('3배 추세만', lev, lag_onto(lev, target(c, filt=False))),
                           ('1배 보유', one, pd.Series(1.0, index=c.index))]:
        e = evaluate(sim(px, exp), start=start)
        out[label] = e
    f = lambda e: f"{e['cagr']:6.1%} / {e['mdd']:6.1%}"
    print(f"{name:28s} {start}~ | 규칙 {f(out['3배+추세+필터'])} | 추세만 {f(out['3배 추세만'])} | 1배 보유 {f(out['1배 보유'])} | ±15% 넘는 날 {len(big)}")
    return out

if __name__ == '__main__':
    D = 'dl/'
    print('지수                          평가 시작     | CAGR / MDD (세후, 수수료 0.09%)')
    gspc = load('_GSPC', 'close')
    run_index('S&P500 (금리 ^IRX, drag 1%)', gspc, irx)
    run_index('S&P500 1995~', gspc, irx, eval_from='1995-03-01')
    n225 = yahoo(D + 'N225.json')
    run_index('닛케이225 (금리 0)', n225[n225.index >= '1984-01-01'], None)
    run_index('닛케이225 1990~ (금리 0)', n225[n225.index >= '1984-01-01'], None, eval_from='1990-01-01')
    run_index('닛케이225 1990~ (금리 ^IRX)', n225[n225.index >= '1984-01-01'], irx, eval_from='1990-01-01')
    ks = yahoo(D + 'KS11.json')
    run_index('코스피 (금리 0)', ks, None)
    run_index('코스피 (금리 ^IRX)', ks, irx)
    dax = yahoo(D + 'GDAXI.json')
    run_index('DAX 총수익지수 (금리 ^IRX)', dax, irx)
    hsi = yahoo(D + 'HSI.json')
    run_index('항셍 (금리 ^IRX)', hsi, irx)
    ftse = yahoo(D + 'FTSE.json')
    run_index('FTSE100 가격지수 (금리 ^IRX)', ftse, irx)
