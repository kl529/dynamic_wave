'use client'

import React, { useState, useEffect } from 'react';
import { Button, Modal, Space, Typography, Steps } from 'antd';
import { 
  DownloadOutlined, 
  MobileOutlined,
  BellOutlined,
  CheckCircleOutlined,
  CloseOutlined
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

interface PWAInstallPromptProps {
  visible: boolean;
  onClose: () => void;
}

export const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({
  visible,
  onClose
}) => {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // PWA 설치 프롬프트 이벤트 리스너
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    // PWA 설치 완료 이벤트
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // 이미 설치되었는지 확인
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) {
      // 브라우저에서 지원하지 않는 경우 수동 설치 안내
      setCurrentStep(1);
      return;
    }

    try {
      const result = await installPrompt.prompt();
      
      if (result.outcome === 'accepted') {
        setCurrentStep(2);
        setInstallPrompt(null);
      } else {
        setCurrentStep(1);
      }
    } catch (error) {
      console.error('PWA 설치 오류:', error);
      setCurrentStep(1);
    }
  };

  const installSteps = [
    {
      title: '앱 설치',
      description: '동파법 SOXL 앱을 홈화면에 추가하세요',
      icon: <DownloadOutlined />
    },
    {
      title: '수동 설치',
      description: '브라우저 메뉴에서 "홈 화면에 추가"를 선택하세요',
      icon: <MobileOutlined />
    },
    {
      title: '설치 완료',
      description: '이제 홈화면에서 바로 접속할 수 있습니다',
      icon: <CheckCircleOutlined />
    }
  ];

  const getInstallInstructions = () => {
    const userAgent = navigator.userAgent;
    
    if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      return {
        browser: 'Safari (iOS)',
        steps: [
          '1. Safari에서 공유 버튼(↑) 터치',
          '2. "홈 화면에 추가" 선택',
          '3. "추가" 터치하여 설치 완료'
        ]
      };
    } else if (userAgent.includes('Android')) {
      return {
        browser: 'Chrome (Android)',
        steps: [
          '1. 브라우저 메뉴(⋮) 터치',
          '2. "홈 화면에 추가" 선택',
          '3. "설치" 터치하여 설치 완료'
        ]
      };
    } else {
      return {
        browser: 'Desktop Browser',
        steps: [
          '1. 주소창 옆 설치 아이콘(⊕) 클릭',
          '2. "설치" 버튼 클릭',
          '3. 설치 완료 후 바탕화면에서 실행'
        ]
      };
    }
  };

  const instructions = getInstallInstructions();

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={500}
      centered
      closable={false}
    >
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        {isInstalled ? (
          // 설치 완료 상태
          <div>
            <CheckCircleOutlined 
              style={{ fontSize: '48px', color: '#52c41a', marginBottom: 16 }} 
            />
            <Title level={3}>설치 완료!</Title>
            <Paragraph>
              동파법 SOXL 앱이 성공적으로 설치되었습니다.
              <br />
              이제 홈화면에서 바로 접속할 수 있습니다.
            </Paragraph>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div style={{ 
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                borderRadius: '6px',
                padding: '16px'
              }}>
                <Text strong style={{ color: '#389e0d' }}>
                  ✓ 오프라인에서도 사용 가능
                  <br />
                  ✓ 매매 신호 푸시 알림
                  <br />
                  ✓ 빠른 실행 속도
                </Text>
              </div>
              <Button type="primary" size="large" onClick={onClose}>
                확인
              </Button>
            </Space>
          </div>
        ) : (
          // 설치 안내
          <div>
            <Steps
              current={currentStep}
              items={installSteps}
              direction="vertical"
              size="small"
              style={{ marginBottom: 24 }}
            />

            {currentStep === 0 && (
              <div>
                <MobileOutlined 
                  style={{ fontSize: '48px', color: '#1890ff', marginBottom: 16 }} 
                />
                <Title level={3}>앱으로 설치하기</Title>
                <Paragraph>
                  동파법 SOXL을 앱으로 설치하면 더욱 편리하게 사용할 수 있습니다.
                </Paragraph>
                
                <div style={{ 
                  background: '#e6f7ff',
                  border: '1px solid #91d5ff',
                  borderRadius: '6px',
                  padding: '16px',
                  marginBottom: '24px'
                }}>
                  <Text strong>앱 설치의 장점:</Text>
                  <ul style={{ textAlign: 'left', margin: '8px 0 0 0' }}>
                    <li>홈화면에서 바로 실행</li>
                    <li>매매 신호 푸시 알림</li>
                    <li>오프라인에서도 사용 가능</li>
                    <li>네이티브 앱과 같은 경험</li>
                    <li>빠른 로딩 속도</li>
                  </ul>
                </div>

                <Space>
                  <Button 
                    type="primary" 
                    size="large"
                    icon={<DownloadOutlined />}
                    onClick={handleInstall}
                  >
                    지금 설치하기
                  </Button>
                  <Button size="large" onClick={onClose}>
                    나중에
                  </Button>
                </Space>
              </div>
            )}

            {currentStep === 1 && (
              <div>
                <MobileOutlined 
                  style={{ fontSize: '48px', color: '#faad14', marginBottom: 16 }} 
                />
                <Title level={3}>수동 설치 안내</Title>
                <Paragraph>
                  {instructions.browser}에서 다음 단계를 따라 설치해주세요:
                </Paragraph>
                
                <div style={{ 
                  background: '#fff7e6',
                  border: '1px solid #ffd591',
                  borderRadius: '6px',
                  padding: '16px',
                  marginBottom: '24px'
                }}>
                  <ul style={{ textAlign: 'left', margin: 0 }}>
                    {instructions.steps.map((step, index) => (
                      <li key={index} style={{ marginBottom: '8px' }}>
                        <Text>{step}</Text>
                      </li>
                    ))}
                  </ul>
                </div>

                <Space>
                  <Button type="primary" size="large" onClick={onClose}>
                    이해했어요
                  </Button>
                  <Button size="large" onClick={() => setCurrentStep(0)}>
                    다시 시도
                  </Button>
                </Space>
              </div>
            )}

            {currentStep === 2 && (
              <div>
                <CheckCircleOutlined 
                  style={{ fontSize: '48px', color: '#52c41a', marginBottom: 16 }} 
                />
                <Title level={3}>설치 진행 중...</Title>
                <Paragraph>
                  앱 설치가 완료되면 홈화면에서 확인할 수 있습니다.
                </Paragraph>
                <Button type="primary" size="large" onClick={onClose}>
                  확인
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};