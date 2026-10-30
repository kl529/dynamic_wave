const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/** m월의 n번째 요일(dow: 0=일). n = -1 이면 마지막 */
function nthWeekday(y: number, m: number, dow: number, n: number): string {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return ymd(y, m, 1 + ((dow - first + 7) % 7) + (n - 1) * 7);
  }
  const lastDay = new Date(Date.UTC(y, m, 0));
  return ymd(y, m, lastDay.getUTCDate() - ((lastDay.getUTCDay() - dow + 7) % 7));
}

/** 토요일 공휴일은 전날 금요일, 일요일 공휴일은 다음 월요일에 쉰다 */
function observed(y: number, m: number, d: number): string {
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return ymd(y, m, d + (dow === 6 ? -1 : dow === 0 ? 1 : 0));
}

/** 부활절 (그레고리력, Anonymous Gregorian algorithm) */
function easter(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, month, day);
}

/**
 * NYSE 정규 휴장일 (1998년 이후 규칙).
 * ponytail: 국장·허리케인 등 임시 휴장은 없다. 필요하면 날짜 목록을 추가.
 */
export function nyseHolidays(y: number): Set<string> {
  const goodFriday = new Date(`${easter(y)}T00:00:00Z`);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  const jan1 = new Date(Date.UTC(y, 0, 1)).getUTCDay();
  const days = [
    jan1 === 6 ? '' : observed(y, 1, 1), // 1/1이 토요일이면 전년 12/31은 쉬지 않는다
    nthWeekday(y, 1, 1, 3), nthWeekday(y, 2, 1, 3), goodFriday.toISOString().slice(0, 10),
    nthWeekday(y, 5, 1, -1), y >= 2022 ? observed(y, 6, 19) : '', observed(y, 7, 4),
    nthWeekday(y, 9, 1, 1), nthWeekday(y, 11, 4, 4), observed(y, 12, 25),
  ];
  return new Set(days.filter(Boolean));
}

export function isTradingDay(date: string): boolean {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6 && !nyseHolidays(Number(date.slice(0, 4))).has(date);
}

/** 다음 정규장 날짜 (주말·NYSE 휴장일 건너뜀) */
export function nextTradingDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  let next: string;
  do {
    d.setUTCDate(d.getUTCDate() + 1);
    next = d.toISOString().slice(0, 10);
  } while (!isTradingDay(next));
  return next;
}
