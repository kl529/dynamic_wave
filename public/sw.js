// Service Worker for PWA
const CACHE_NAME = 'dongpa-soxl-v1.0.0';
const STATIC_CACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-72x72.png',
  '/icon-192x192.png', 
  '/icon-512x512.png'
];

// API 캐시 설정 (짧은 시간)
const API_CACHE_NAME = 'dongpa-api-v1.0.0';
const API_CACHE_TIME = 30 * 1000; // 30초

// 설치 이벤트
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      // 정적 리소스 캐시
      caches.open(CACHE_NAME).then(cache => {
        return cache.addAll(STATIC_CACHE_URLS);
      }),
      // API 캐시 생성
      caches.open(API_CACHE_NAME)
    ])
  );
  
  // 즉시 활성화
  self.skipWaiting();
});

// 활성화 이벤트
self.addEventListener('activate', event => {
  event.waitUntil(
    // 오래된 캐시 정리
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // 모든 클라이언트에서 즉시 제어
  self.clients.claim();
});

// Fetch 이벤트 처리
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // API 요청 처리
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }
  
  // 정적 리소스 처리
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        // 캐시된 응답이 있으면 반환
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // 네트워크에서 가져오기
        return fetch(request)
          .then(response => {
            // 응답이 유효하면 캐시에 저장
            if (response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseClone);
              });
            }
            return response;
          })
          .catch(() => {
            // 네트워크 오류시 기본 페이지 반환
            if (request.destination === 'document') {
              return caches.match('/');
            }
          });
      })
  );
});

// API 요청 처리 함수
async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // 캐시된 응답이 있고 아직 유효한지 확인
  if (cachedResponse) {
    const cachedDate = new Date(cachedResponse.headers.get('sw-cached-date') || 0);
    const now = new Date();
    
    if (now - cachedDate < API_CACHE_TIME) {
      return cachedResponse;
    }
  }
  
  try {
    // 네트워크에서 새로운 응답 가져오기
    const networkResponse = await fetch(request);
    
    if (networkResponse.status === 200) {
      // 캐시 헤더 추가
      const responseHeaders = new Headers(networkResponse.headers);
      responseHeaders.set('sw-cached-date', new Date().toISOString());
      
      const cachedResponse = new Response(await networkResponse.clone().text(), {
        status: networkResponse.status,
        statusText: networkResponse.statusText,
        headers: responseHeaders
      });
      
      // API 응답 캐시 (짧은 시간)
      cache.put(request, cachedResponse.clone());
      
      return networkResponse;
    }
  } catch (error) {
    console.error('Network request failed:', error);
  }
  
  // 네트워크 오류시 캐시된 응답 반환 (있다면)
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // 완전 실패시 에러 응답
  return new Response(
    JSON.stringify({ error: '데이터를 불러올 수 없습니다.' }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

// 백그라운드 동기화
self.addEventListener('sync', event => {
  if (event.tag === 'check-trading-signals') {
    event.waitUntil(checkTradingSignals());
  }
});

// 매매 신호 체크 함수
async function checkTradingSignals() {
  try {
    // 현재 SOXL 가격 확인
    const response = await fetch('/api/soxl/current');
    
    if (!response.ok) {
      throw new Error('API 요청 실패');
    }
    
    const data = await response.json();
    
    // 간단한 신호 계산 (실제로는 더 복잡한 로직 필요)
    const shouldNotify = Math.abs(data.changePercent) >= 3.0;
    
    if (shouldNotify) {
      const notificationData = {
        title: '🚀 동파법 매매 신호',
        body: `SOXL ${data.changePercent.toFixed(2)}% 변동 - 매매 신호 확인 필요`,
        icon: '/icon-192x192.png',
        badge: '/icon-72x72.png',
        data: {
          url: '/',
          price: data.price,
          change: data.changePercent
        }
      };
      
      await self.registration.showNotification(
        notificationData.title,
        notificationData
      );
    }
  } catch (error) {
    console.error('백그라운드 신호 체크 실패:', error);
  }
}

// 푸시 메시지 처리
self.addEventListener('push', event => {
  if (!event.data) {
    return;
  }
  
  const pushData = event.data.json();
  
  const notificationOptions = {
    body: pushData.body || '새로운 매매 신호가 있습니다.',
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: pushData.data || {},
    actions: [
      {
        action: 'open',
        title: '앱 열기',
        icon: '/icon-192x192.png'
      },
      {
        action: 'dismiss',
        title: '닫기'
      }
    ],
    requireInteraction: true,
    tag: 'trading-signal'
  };
  
  event.waitUntil(
    self.registration.showNotification(
      pushData.title || '동파법 매매 알림',
      notificationOptions
    )
  );
});

// 알림 클릭 처리
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const action = event.action;
  const notificationData = event.notification.data || {};
  
  if (action === 'open' || !action) {
    // 앱 열기
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        // 이미 열린 탭이 있으면 포커스
        for (const client of clientList) {
          if (client.url.includes(self.location.origin)) {
            return client.focus();
          }
        }
        
        // 새 탭 열기
        return clients.openWindow(notificationData.url || '/');
      })
    );
  }
  // dismiss 액션은 알림만 닫음 (기본 동작)
});

// 알림 닫기 처리
self.addEventListener('notificationclose', event => {
  // 알림 닫기 통계 수집 등
  console.log('Notification closed:', event.notification.tag);
});

// 메시지 처리 (클라이언트와 통신)
self.addEventListener('message', event => {
  const { action, data } = event.data;
  
  switch (action) {
    case 'CHECK_TRADING_SIGNALS':
      event.waitUntil(checkTradingSignals());
      break;
      
    case 'CLEAR_CACHE':
      event.waitUntil(
        Promise.all([
          caches.delete(CACHE_NAME),
          caches.delete(API_CACHE_NAME)
        ]).then(() => {
          event.ports[0]?.postMessage({ success: true });
        })
      );
      break;
      
    case 'GET_CACHE_STATUS':
      event.waitUntil(
        caches.keys().then(cacheNames => {
          event.ports[0]?.postMessage({
            caches: cacheNames,
            version: CACHE_NAME
          });
        })
      );
      break;
      
    default:
      break;
  }
});

// 오류 처리
self.addEventListener('error', event => {
  console.error('Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('Service Worker unhandled rejection:', event.reason);
});