/**
 * 로그인 쿠키 값. 비밀번호 원문 대신 해시를 저장한다 (Edge 미들웨어와 라우트 모두에서 동작하는 Web Crypto).
 * ponytail: 쿠키가 유출되면 약한 비밀번호는 오프라인 대입 공격이 가능하다. 막으려면 별도 AUTH_SECRET으로 HMAC.
 */
export async function authToken(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`dongpa-site-auth:${password}`));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
