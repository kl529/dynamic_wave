'use client'

import { TIMING, NOTIFICATION } from '@/constants';

// 안전한 JSON 파싱
const safeJsonParse = <T,>(json: string | null, fallback: T): T => {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
};

export class NotificationManager {
  private static instance: NotificationManager;
  private swRegistration: ServiceWorkerRegistration | null = null;

  private constructor() {
    this.initializeServiceWorker();
  }

  public static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  // Service Worker 초기화
  private async initializeServiceWorker(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        this.swRegistration = registration;
        
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // 새 버전 사용 가능 알림
                this.notifyNewVersion();
              }
            });
          }
        });

        console.log('Service Worker 등록 완료:', registration.scope);
      } catch (error) {
        console.error('Service Worker 등록 실패:', error);
      }
    }
  }

  // 알림 권한 요청
  public async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('이 브라우저는 알림을 지원하지 않습니다.');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'denied') {
      console.warn('알림 권한이 거부되었습니다.');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (error) {
      console.error('알림 권한 요청 실패:', error);
      return false;
    }
  }

  // 즉시 알림 보내기
  public async sendImmediateNotification(
    title: string, 
    options: {
      body?: string;
      icon?: string;
      data?: any;
      tag?: string;
      requireInteraction?: boolean;
    } = {}
  ): Promise<boolean> {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) {
      return false;
    }

    try {
      const notification = new Notification(title, {
        body: options.body || '',
        icon: options.icon || NOTIFICATION.ICON_192,
        badge: NOTIFICATION.ICON_72,
        data: options.data || {},
        tag: options.tag || 'dongpa-notification',
        requireInteraction: options.requireInteraction || false
      });

      // 클릭 이벤트 처리
      notification.onclick = () => {
        window.focus();
        notification.close();
        
        // 데이터가 있으면 해당 페이지로 이동
        if (options.data?.url) {
          window.location.href = options.data.url;
        }
      };

      // 자동 닫기
      setTimeout(() => {
        notification.close();
      }, TIMING.NOTIFICATION_AUTO_CLOSE_MS);

      return true;
    } catch (error) {
      console.error('알림 발송 실패:', error);
      return false;
    }
  }

  // 매매 신호 알림
  public async sendTradingSignal(
    type: 'BUY' | 'SELL' | 'HOLD',
    data: {
      price: number;
      changePercent: number;
      signal?: string;
      quantity?: number;
      amount?: number;
    }
  ): Promise<boolean> {
    const messages = {
      BUY: {
        title: '🚀 매수 신호 발생!',
        body: `SOXL $${data.price.toFixed(2)} (${data.changePercent.toFixed(2)}%) - 매수 타이밍입니다!`,
        tag: 'trading-buy'
      },
      SELL: {
        title: '💰 매도 신호 발생!', 
        body: `SOXL $${data.price.toFixed(2)} - 수익 실현을 고려해보세요!`,
        tag: 'trading-sell'
      },
      HOLD: {
        title: '📊 동파법 상태 업데이트',
        body: `SOXL $${data.price.toFixed(2)} (${data.changePercent.toFixed(2)}%) - 현재 관망 상태`,
        tag: 'trading-hold'
      }
    };

    const config = messages[type];
    
    return this.sendImmediateNotification(config.title, {
      body: config.body,
      tag: config.tag,
      requireInteraction: type !== 'HOLD',
      data: {
        type,
        ...data,
        timestamp: Date.now(),
        url: '/?tab=realtime'
      }
    });
  }

  // 백테스팅 완료 알림
  public async sendBacktestComplete(result: {
    finalReturn: number;
    winRate: number;
    maxDrawdown: number;
  }): Promise<boolean> {
    return this.sendImmediateNotification('📈 백테스팅 완료!', {
      body: `수익률: ${result.finalReturn.toFixed(2)}%, 승률: ${result.winRate.toFixed(1)}%`,
      tag: 'backtest-complete',
      data: {
        ...result,
        url: '/?tab=backtest'
      }
    });
  }

  // 가격 알림 (특정 가격 도달 시)
  public async sendPriceAlert(
    price: number,
    targetPrice: number,
    type: 'above' | 'below'
  ): Promise<boolean> {
    const title = type === 'above' ? '📈 목표가 돌파!' : '📉 목표가 하락!';
    const body = `SOXL이 $${price.toFixed(2)}에 도달했습니다 (목표: $${targetPrice.toFixed(2)})`;

    return this.sendImmediateNotification(title, {
      body,
      tag: 'price-alert',
      requireInteraction: true,
      data: {
        price,
        targetPrice,
        type,
        url: '/?tab=realtime'
      }
    });
  }

  // 백그라운드 동기화 등록
  public async registerBackgroundSync(): Promise<boolean> {
    if (!this.swRegistration) {
      return false;
    }

    try {
      // @ts-ignore - Background Sync API may not be available in all browsers
      if ('sync' in this.swRegistration) {
        // @ts-ignore
        await this.swRegistration.sync.register('check-trading-signals');
        console.log('백그라운드 동기화 등록 완료');
        return true;
      }
      return false;
    } catch (error) {
      console.error('백그라운드 동기화 등록 실패:', error);
      return false;
    }
  }

  // Service Worker에 메시지 보내기
  public async sendMessageToSW(action: string, data?: any): Promise<any> {
    if (!this.swRegistration || !navigator.serviceWorker.controller) {
      throw new Error('Service Worker가 준비되지 않았습니다.');
    }

    return new Promise((resolve, reject) => {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        resolve(event.data);
      };

      navigator.serviceWorker.controller!.postMessage(
        { action, data },
        [messageChannel.port2]
      );

      // 타임아웃 설정
      setTimeout(() => {
        reject(new Error('Service Worker 응답 시간 초과'));
      }, TIMING.PERMISSION_TIMEOUT_MS);
    });
  }

  // 캐시 상태 확인
  public async getCacheStatus(): Promise<any> {
    try {
      return await this.sendMessageToSW('GET_CACHE_STATUS');
    } catch (error) {
      console.error('캐시 상태 확인 실패:', error);
      return null;
    }
  }

  // 캐시 초기화
  public async clearCache(): Promise<boolean> {
    try {
      const result = await this.sendMessageToSW('CLEAR_CACHE');
      return result?.success || false;
    } catch (error) {
      console.error('캐시 초기화 실패:', error);
      return false;
    }
  }

  // 수동 매매 신호 체크
  public async checkTradingSignals(): Promise<void> {
    try {
      await this.sendMessageToSW('CHECK_TRADING_SIGNALS');
    } catch (error) {
      console.error('매매 신호 체크 실패:', error);
    }
  }

  // 알림 설정 저장
  public saveNotificationSettings(settings: {
    enabled: boolean;
    buySignals: boolean;
    sellSignals: boolean;
    priceAlerts: boolean;
    backtestComplete: boolean;
    quietHours?: {
      enabled: boolean;
      start: string;
      end: string;
    };
  }): void {
    localStorage.setItem('dongpa-notification-settings', JSON.stringify(settings));
  }

  // 알림 설정 로드
  public getNotificationSettings(): any {
    const saved = localStorage.getItem('dongpa-notification-settings');
    const defaultSettings = {
      enabled: true,
      buySignals: true,
      sellSignals: true,
      priceAlerts: true,
      backtestComplete: false,
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '08:00'
      }
    };
    
    return safeJsonParse(saved, defaultSettings);
  }

  // 조용한 시간 체크
  private isQuietHours(): boolean {
    const settings = this.getNotificationSettings();
    
    if (!settings.quietHours?.enabled) {
      return false;
    }

    const now = new Date();
    const currentTime = now.getHours() * 100 + now.getMinutes();
    
    const start = parseInt(settings.quietHours.start.replace(':', ''));
    const end = parseInt(settings.quietHours.end.replace(':', ''));

    if (start > end) {
      // 밤을 넘나드는 경우 (예: 22:00 ~ 08:00)
      return currentTime >= start || currentTime <= end;
    } else {
      // 같은 날 내의 경우 (예: 13:00 ~ 14:00)
      return currentTime >= start && currentTime <= end;
    }
  }

  // 알림 전송 시 설정 확인
  private async shouldSendNotification(type: string): Promise<boolean> {
    const settings = this.getNotificationSettings();
    
    if (!settings.enabled) {
      return false;
    }

    if (this.isQuietHours()) {
      return false;
    }

    switch (type) {
      case 'buy':
        return settings.buySignals;
      case 'sell':
        return settings.sellSignals;
      case 'price':
        return settings.priceAlerts;
      case 'backtest':
        return settings.backtestComplete;
      default:
        return true;
    }
  }

  // 새 버전 알림
  private async notifyNewVersion(): Promise<void> {
    await this.sendImmediateNotification('🔄 업데이트 사용 가능', {
      body: '새로운 버전이 준비되었습니다. 페이지를 새로고침해주세요.',
      tag: 'app-update',
      requireInteraction: true
    });
  }

  // PWA 설치 프롬프트
  public async promptInstall(): Promise<boolean> {
    // beforeinstallprompt 이벤트 처리는 상위 컴포넌트에서 관리
    return false;
  }
}