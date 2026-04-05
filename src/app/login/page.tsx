'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.replace('/');
    } else {
      const data = await res.json();
      setError(data.error || '비밀번호가 틀렸습니다.');
    }

    setLoading(false);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#0a0a0a',
      color: '#fff',
    }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '2rem', fontWeight: 600 }}>
        동파법 SOXL
      </h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '280px' }}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          autoFocus
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            border: '1px solid #333',
            backgroundColor: '#1a1a1a',
            color: '#fff',
            fontSize: '1rem',
            outline: 'none',
          }}
        />
        {error && <p style={{ color: '#ff4d4f', fontSize: '0.875rem', margin: 0 }}>{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: loading || !password ? '#333' : '#1677ff',
            color: '#fff',
            fontSize: '1rem',
            cursor: loading || !password ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '확인 중...' : '입장'}
        </button>
      </form>
    </div>
  );
}
