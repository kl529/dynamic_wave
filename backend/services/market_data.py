import asyncio
import aiohttp
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import os
from dotenv import load_dotenv

load_dotenv()

class MarketDataService:
    def __init__(self):
        self.alpha_vantage_key = os.getenv("ALPHA_VANTAGE_API_KEY")
        self.base_url = "https://www.alphavantage.co/query"
        self.session = None
    
    async def _get_session(self):
        if self.session is None:
            self.session = aiohttp.ClientSession()
        return self.session
    
    async def get_current_price(self, symbol: str = "SOXL") -> Dict[str, Any]:
        """현재 주가 조회 (Yahoo Finance 백업 포함)"""
        try:
            # Alpha Vantage API 시도
            if self.alpha_vantage_key:
                return await self._get_alpha_vantage_quote(symbol)
        except Exception as e:
            print(f"Alpha Vantage 실패: {e}")
        
        # Yahoo Finance 백업
        try:
            return await self._get_yahoo_quote(symbol)
        except Exception as e:
            print(f"Yahoo Finance 실패: {e}")
        
        # 목업 데이터 반환
        return self._get_mock_data(symbol)
    
    async def _get_alpha_vantage_quote(self, symbol: str) -> Dict[str, Any]:
        """Alpha Vantage API를 통한 실시간 데이터 조회"""
        session = await self._get_session()
        params = {
            "function": "GLOBAL_QUOTE",
            "symbol": symbol,
            "apikey": self.alpha_vantage_key
        }
        
        async with session.get(self.base_url, params=params) as response:
            data = await response.json()
            
            if "Error Message" in data:
                raise Exception("API 호출 한도 초과")
            
            quote = data.get("Global Quote", {})
            if not quote:
                raise Exception("유효하지 않은 응답")
            
            return {
                "symbol": symbol,
                "price": float(quote.get("05. price", 0)),
                "change": float(quote.get("09. change", 0)),
                "changePercent": float(quote.get("10. change percent", "0%").replace("%", "")),
                "volume": int(quote.get("06. volume", 0)),
                "high": float(quote.get("03. high", 0)),
                "low": float(quote.get("04. low", 0)),
                "open": float(quote.get("02. open", 0)),
                "timestamp": datetime.now()
            }
    
    async def _get_yahoo_quote(self, symbol: str) -> Dict[str, Any]:
        """Yahoo Finance를 통한 실시간 데이터 조회"""
        ticker = yf.Ticker(symbol)
        info = ticker.info
        hist = ticker.history(period="2d")
        
        if hist.empty:
            raise Exception("Yahoo Finance에서 데이터를 가져올 수 없습니다")
        
        latest = hist.iloc[-1]
        prev_close = hist.iloc[-2]["Close"] if len(hist) > 1 else latest["Close"]
        
        current_price = float(latest["Close"])
        change = current_price - float(prev_close)
        change_percent = (change / float(prev_close)) * 100
        
        return {
            "symbol": symbol,
            "price": current_price,
            "change": change,
            "changePercent": change_percent,
            "volume": int(latest["Volume"]),
            "high": float(latest["High"]),
            "low": float(latest["Low"]),
            "open": float(latest["Open"]),
            "timestamp": datetime.now()
        }
    
    def _get_mock_data(self, symbol: str) -> Dict[str, Any]:
        """목업 데이터 (API 실패시 사용)"""
        base_price = 28.45 if symbol == "SOXL" else 100.0
        change = np.random.uniform(-3.0, 3.0)
        
        return {
            "symbol": symbol,
            "price": round(base_price + change, 2),
            "change": round(change, 2),
            "changePercent": round((change / base_price) * 100, 2),
            "volume": np.random.randint(20000000, 80000000),
            "high": round(base_price + abs(change) + 1, 2),
            "low": round(base_price - abs(change) - 1, 2),
            "open": round(base_price + np.random.uniform(-1, 1), 2),
            "timestamp": datetime.now()
        }
    
    async def get_historical_data(self, symbol: str = "SOXL", days: int = 90) -> List[Dict[str, Any]]:
        """과거 데이터 조회"""
        try:
            # Alpha Vantage API 시도
            if self.alpha_vantage_key:
                return await self._get_alpha_vantage_historical(symbol, days)
        except Exception as e:
            print(f"Alpha Vantage 과거 데이터 실패: {e}")
        
        # Yahoo Finance 백업
        try:
            return await self._get_yahoo_historical(symbol, days)
        except Exception as e:
            print(f"Yahoo Finance 과거 데이터 실패: {e}")
        
        # 목업 데이터 반환
        return self._get_mock_historical_data(symbol, days)
    
    async def _get_alpha_vantage_historical(self, symbol: str, days: int) -> List[Dict[str, Any]]:
        """Alpha Vantage API를 통한 과거 데이터 조회"""
        session = await self._get_session()
        params = {
            "function": "TIME_SERIES_DAILY",
            "symbol": symbol,
            "outputsize": "full",
            "apikey": self.alpha_vantage_key
        }
        
        async with session.get(self.base_url, params=params) as response:
            data = await response.json()
            
            if "Error Message" in data:
                raise Exception("API 호출 한도 초과")
            
            time_series = data.get("Time Series (Daily)", {})
            if not time_series:
                raise Exception("유효하지 않은 응답")
            
            # 날짜별로 정렬하고 최근 N일 데이터 추출
            sorted_dates = sorted(time_series.keys())[-days:]
            historical_data = []
            
            for i, date in enumerate(sorted_dates):
                day_data = time_series[date]
                prev_price = float(time_series[sorted_dates[i-1]]["4. close"]) if i > 0 else float(day_data["4. close"])
                current_price = float(day_data["4. close"])
                change = current_price - prev_price
                change_percent = (change / prev_price) * 100 if prev_price > 0 else 0
                
                historical_data.append({
                    "date": date,
                    "price": current_price,
                    "change": round(change, 2),
                    "changePercent": round(change_percent, 2),
                    "volume": int(day_data["5. volume"]),
                    "high": float(day_data["2. high"]),
                    "low": float(day_data["3. low"]),
                    "open": float(day_data["1. open"])
                })
            
            return historical_data
    
    async def _get_yahoo_historical(self, symbol: str, days: int) -> List[Dict[str, Any]]:
        """Yahoo Finance를 통한 과거 데이터 조회"""
        ticker = yf.Ticker(symbol)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days + 30)  # 주말 제외를 위해 여유롭게
        
        hist = ticker.history(start=start_date, end=end_date)
        
        if hist.empty:
            raise Exception("Yahoo Finance에서 과거 데이터를 가져올 수 없습니다")
        
        # 최근 N일간의 거래일만 선택
        hist = hist.tail(days)
        historical_data = []
        
        for i, (date, row) in enumerate(hist.iterrows()):
            prev_close = hist.iloc[i-1]["Close"] if i > 0 else row["Close"]
            current_price = float(row["Close"])
            change = current_price - float(prev_close)
            change_percent = (change / float(prev_close)) * 100 if prev_close > 0 else 0
            
            historical_data.append({
                "date": date.strftime("%Y-%m-%d"),
                "price": round(current_price, 2),
                "change": round(change, 2),
                "changePercent": round(change_percent, 2),
                "volume": int(row["Volume"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "open": float(row["Open"])
            })
        
        return historical_data
    
    def _get_mock_historical_data(self, symbol: str, days: int) -> List[Dict[str, Any]]:
        """목업 과거 데이터 생성"""
        historical_data = []
        base_price = 28.45 if symbol == "SOXL" else 100.0
        price = base_price
        start_date = datetime.now() - timedelta(days=days)
        
        for i in range(days):
            date = start_date + timedelta(days=i)
            
            # 주말 건너뛰기
            if date.weekday() >= 5:
                continue
            
            # SOXL의 높은 변동성 반영 (-15% ~ +15%)
            daily_change_percent = np.random.uniform(-15, 15)
            price_change = price * (daily_change_percent / 100)
            price = max(15.0, price + price_change)  # 최소가 15달러
            
            volume = np.random.randint(20000000, 80000000)
            high = price * (1 + np.random.uniform(0, 0.05))
            low = price * (1 - np.random.uniform(0, 0.05))
            open_price = price * (1 + np.random.uniform(-0.02, 0.02))
            
            historical_data.append({
                "date": date.strftime("%Y-%m-%d"),
                "price": round(price, 2),
                "change": round(price_change, 2),
                "changePercent": round(daily_change_percent, 2),
                "volume": volume,
                "high": round(high, 2),
                "low": round(low, 2),
                "open": round(open_price, 2)
            })
        
        return historical_data
    
    async def get_recent_data(self, symbol: str = "SOXL", days: int = 10) -> List[Dict[str, Any]]:
        """최근 N일간의 데이터 조회 (실시간 신호 계산용)"""
        return await self.get_historical_data(symbol, days)
    
    async def close(self):
        """세션 정리"""
        if self.session:
            await self.session.close()