#!/usr/bin/env python3
"""
동파법 SOXL 자동매매 백엔드 서버 시작 스크립트
"""

import uvicorn
import os
from dotenv import load_dotenv

# 환경 변수 로드
load_dotenv()

if __name__ == "__main__":
    # 환경 변수에서 설정 읽기
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    debug = os.getenv("DEBUG", "True").lower() == "true"
    
    print("🚀 동파법 SOXL 자동매매 API 서버 시작")
    print(f"📍 서버 주소: http://{host}:{port}")
    print(f"📋 API 문서: http://{host}:{port}/docs")
    print(f"🔧 디버그 모드: {debug}")
    print("-" * 50)
    
    # 서버 실행
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=debug,
        access_log=debug,
        log_level="info" if debug else "warning"
    )