from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime

class DongpaConfig(BaseModel):
    initialCapital: float = Field(..., gt=0, description="초기 투자금액")
    divisions: int = Field(..., ge=3, le=10, description="분할 횟수 (3-10)")
    mode: Literal["safe", "aggressive"] = Field(..., description="투자 모드")

class MarketDataResponse(BaseModel):
    symbol: str = "SOXL"
    price: float
    change: float
    changePercent: float
    volume: int
    timestamp: datetime
    high: Optional[float] = None
    low: Optional[float] = None
    open: Optional[float] = None

class TradeSignalResponse(BaseModel):
    currentSignal: Literal["BUY", "SELL", "HOLD"]
    nextBuyPrice: Optional[float] = None
    nextSellPrice: Optional[float] = None
    cashRemaining: float
    currentHoldings: float
    avgPrice: float
    totalAssets: float
    returnRate: float

class Trade(BaseModel):
    date: str
    price: float
    change: float
    action: Literal["BUY", "SELL", "HOLD"]
    quantity: int
    amount: float
    commission: float
    profit: float
    cash: float
    holdings: int
    avgPrice: float
    currentValue: float
    totalAssets: float
    returnRate: float
    drawdown: float

class TradingSummary(BaseModel):
    totalTrades: int
    buyTrades: int
    sellTrades: int
    winRate: float
    avgWin: float
    avgLoss: float
    totalCommission: float
    finalReturn: float
    maxDrawdown: float
    sharpeRatio: float

class BacktestRequest(BaseModel):
    config: DongpaConfig
    days: int = Field(default=90, ge=30, le=365, description="백테스팅 기간 (일)")

class BacktestResponse(BaseModel):
    trades: List[Trade]
    summary: TradingSummary
    config: DongpaConfig
    period: Dict[str, str]

class NotificationRequest(BaseModel):
    enabled: bool
    email: Optional[str] = None
    webhook: Optional[str] = None
    conditions: Dict[str, Any] = {}