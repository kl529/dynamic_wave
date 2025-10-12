from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
from dotenv import load_dotenv
import uvicorn

from services.market_data import MarketDataService
from services.dongpa_engine import DongpaEngine
from services.backtesting import BacktestingService
from models.schemas import (
    DongpaConfig, 
    MarketDataResponse, 
    BacktestRequest, 
    BacktestResponse,
    TradeSignalResponse
)

load_dotenv()

app = FastAPI(
    title="동파법 SOXL 자동매매 API",
    description="실시간 SOXL 동파법 매매 신호 및 백테스팅 API",
    version="1.0.0"
)

# CORS 설정
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://dongpa-soxl.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 서비스 인스턴스 초기화
market_service = MarketDataService()
backtesting_service = BacktestingService()

@app.get("/")
async def root():
    return {"message": "동파법 SOXL 자동매매 API가 실행 중입니다."}

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "message": "API 서버가 정상 작동 중입니다."}

@app.get("/api/soxl/current", response_model=MarketDataResponse)
async def get_current_soxl_data():
    """현재 SOXL 주가 데이터 조회"""
    try:
        data = await market_service.get_current_price("SOXL")
        return MarketDataResponse(**data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"데이터 조회 실패: {str(e)}")

@app.get("/api/soxl/historical", response_model=List[MarketDataResponse])
async def get_historical_soxl_data(days: int = 90):
    """SOXL 과거 주가 데이터 조회"""
    try:
        data = await market_service.get_historical_data("SOXL", days)
        return [MarketDataResponse(**item) for item in data]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"과거 데이터 조회 실패: {str(e)}")

@app.post("/api/dongpa/signals", response_model=TradeSignalResponse)
async def get_trading_signals(config: DongpaConfig):
    """동파법 매매 신호 계산"""
    try:
        # 최근 데이터 조회
        recent_data = await market_service.get_recent_data("SOXL", 10)
        
        # 동파법 엔진 초기화
        engine = DongpaEngine(
            initial_capital=config.initialCapital,
            divisions=config.divisions,
            mode=config.mode
        )
        
        # 신호 계산
        result = engine.calculate_signals(recent_data)
        
        return TradeSignalResponse(
            currentSignal=result["current_signal"],
            nextBuyPrice=result["next_buy_price"],
            nextSellPrice=result["next_sell_price"],
            cashRemaining=result["cash_remaining"],
            currentHoldings=result["current_holdings"],
            avgPrice=result["avg_price"],
            totalAssets=result["total_assets"],
            returnRate=result["return_rate"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"신호 계산 실패: {str(e)}")

@app.post("/api/dongpa/backtest", response_model=BacktestResponse)
async def run_backtest(request: BacktestRequest):
    """백테스팅 실행"""
    try:
        # 과거 데이터 조회
        historical_data = await market_service.get_historical_data("SOXL", request.days)
        
        # 백테스팅 실행
        result = backtesting_service.run_backtest(
            data=historical_data,
            config=request.config
        )
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"백테스팅 실패: {str(e)}")

@app.get("/api/dongpa/summary/{mode}")
async def get_strategy_summary(mode: str):
    """전략 요약 정보 조회"""
    try:
        if mode not in ['safe', 'aggressive']:
            raise HTTPException(status_code=400, detail="올바른 모드를 선택해주세요 (safe, aggressive)")
        
        summary = {
            "safe": {
                "name": "안전모드",
                "buyTarget": 3.0,
                "sellTarget": 0.2,
                "expectedReturn": "연 15-25%",
                "maxDrawdown": "20-30%",
                "holdingDays": "평균 30일",
                "riskLevel": "중간",
                "description": "안정적인 수익을 추구하는 보수적 전략"
            },
            "aggressive": {
                "name": "공세모드", 
                "buyTarget": 5.0,
                "sellTarget": 2.5,
                "expectedReturn": "연 30-50%",
                "maxDrawdown": "40-60%",
                "holdingDays": "평균 7일",
                "riskLevel": "높음",
                "description": "높은 수익을 추구하는 공격적 전략"
            }
        }
        
        return summary[mode]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"요약 정보 조회 실패: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("DEBUG", "True").lower() == "true"
    )