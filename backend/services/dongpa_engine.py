import numpy as np
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime, timedelta
import math

class DongpaEngine:
    """동파법 매매 신호 계산 엔진"""
    
    def __init__(self, initial_capital: float = 10000, divisions: int = 7, mode: str = "safe"):
        self.initial_capital = initial_capital
        self.divisions = divisions
        self.mode = mode
        
        # 수수료 설정 (미국 주식)
        self.fees = {
            "commission": 0.00044,  # 0.044% 거래 수수료
            "sec_fee": 0.0000278    # SEC 수수료
        }
        
        # 모드별 설정
        self.mode_config = {
            "safe": {
                "sell_target": 0.002,    # 0.2% 수익에서 매도
                "buy_target": 0.03,      # 3.0% 하락에서 매수
                "holding_days": 30       # 평균 보유 기간
            },
            "aggressive": {
                "sell_target": 0.025,    # 2.5% 수익에서 매도  
                "buy_target": 0.05,      # 5.0% 하락에서 매수
                "holding_days": 7        # 평균 보유 기간
            }
        }
        
        self.config = self.mode_config.get(mode, self.mode_config["safe"])
        self.base_amount = initial_capital / divisions
        
        # 포트폴리오 상태
        self.reset_portfolio()
    
    def reset_portfolio(self):
        """포트폴리오 상태 초기화"""
        self.portfolio = {
            "cash": self.initial_capital,
            "holdings": 0,
            "avg_price": 0.0,
            "total_cost": 0.0,
            "peak_value": self.initial_capital,
            "max_drawdown": 0.0,
            "total_commission": 0.0
        }
    
    def calculate_commission(self, amount: float) -> float:
        """수수료 계산"""
        return amount * (self.fees["commission"] + self.fees["sec_fee"])
    
    def should_buy(self, current_price: float, change_percent: float) -> Tuple[bool, int, float]:
        """매수 조건 확인"""
        # 하락률이 목표치 이상이고 현금이 충분한 경우
        if (abs(change_percent) >= self.config["buy_target"] * 100 and 
            change_percent < 0 and 
            self.portfolio["cash"] >= self.base_amount):
            
            quantity = int(self.base_amount // current_price)
            amount = quantity * current_price
            commission = self.calculate_commission(amount)
            
            if self.portfolio["cash"] >= (amount + commission):
                return True, quantity, amount
        
        return False, 0, 0.0
    
    def should_sell(self, current_price: float) -> Tuple[bool, float]:
        """매도 조건 확인"""
        if (self.portfolio["holdings"] > 0 and 
            self.portfolio["avg_price"] > 0):
            
            profit_rate = (current_price - self.portfolio["avg_price"]) / self.portfolio["avg_price"]
            
            if profit_rate >= self.config["sell_target"]:
                return True, profit_rate
        
        return False, 0.0
    
    def execute_buy(self, price: float, quantity: int, amount: float) -> Dict[str, Any]:
        """매수 실행"""
        commission = self.calculate_commission(amount)
        total_cost = amount + commission
        
        # 평단가 재계산
        new_total_cost = self.portfolio["total_cost"] + amount
        new_holdings = self.portfolio["holdings"] + quantity
        new_avg_price = new_total_cost / new_holdings if new_holdings > 0 else 0
        
        # 포트폴리오 업데이트
        self.portfolio["cash"] -= total_cost
        self.portfolio["holdings"] = new_holdings
        self.portfolio["avg_price"] = new_avg_price
        self.portfolio["total_cost"] = new_total_cost
        self.portfolio["total_commission"] += commission
        
        return {
            "action": "BUY",
            "quantity": quantity,
            "price": price,
            "amount": amount,
            "commission": commission,
            "profit": 0.0
        }
    
    def execute_sell(self, price: float) -> Dict[str, Any]:
        """매도 실행"""
        quantity = self.portfolio["holdings"]
        amount = quantity * price
        commission = self.calculate_commission(amount)
        net_amount = amount - commission
        
        # 수익 계산
        profit = net_amount - self.portfolio["total_cost"]
        
        # 포트폴리오 업데이트
        self.portfolio["cash"] += net_amount
        self.portfolio["holdings"] = 0
        self.portfolio["avg_price"] = 0.0
        self.portfolio["total_cost"] = 0.0
        self.portfolio["total_commission"] += commission
        
        return {
            "action": "SELL",
            "quantity": quantity,
            "price": price,
            "amount": amount,
            "commission": commission,
            "profit": profit
        }
    
    def calculate_signals(self, price_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """가격 데이터를 바탕으로 매매 신호 계산"""
        self.reset_portfolio()
        trades = []
        
        for i, day_data in enumerate(price_data):
            price = day_data["price"]
            change_percent = day_data.get("changePercent", 0)
            
            # 매수 신호 확인
            should_buy, quantity, amount = self.should_buy(price, change_percent)
            
            # 매도 신호 확인  
            should_sell, profit_rate = self.should_sell(price)
            
            trade = {
                "key": i,
                "date": day_data["date"],
                "price": price,
                "change": change_percent,
                "action": "HOLD",
                "quantity": 0,
                "amount": 0.0,
                "commission": 0.0,
                "profit": 0.0
            }
            
            if should_buy:
                result = self.execute_buy(price, quantity, amount)
                trade.update(result)
            elif should_sell:
                result = self.execute_sell(price)
                trade.update(result)
            
            # 포트폴리오 상태 추가
            current_value = self.portfolio["holdings"] * price
            total_assets = self.portfolio["cash"] + current_value
            
            # MDD 계산
            if total_assets > self.portfolio["peak_value"]:
                self.portfolio["peak_value"] = total_assets
            
            drawdown = (self.portfolio["peak_value"] - total_assets) / self.portfolio["peak_value"]
            if drawdown > self.portfolio["max_drawdown"]:
                self.portfolio["max_drawdown"] = drawdown
            
            trade.update({
                "cash": self.portfolio["cash"],
                "holdings": self.portfolio["holdings"],
                "avgPrice": self.portfolio["avg_price"],
                "currentValue": current_value,
                "totalAssets": total_assets,
                "returnRate": ((total_assets - self.initial_capital) / self.initial_capital) * 100,
                "drawdown": -drawdown * 100
            })
            
            trades.append(trade)
        
        # 현재 신호 계산 (최신 데이터 기준)
        current_signal = "HOLD"
        next_buy_price = None
        next_sell_price = None
        
        if price_data:
            latest_data = price_data[-1]
            current_price = latest_data["price"]
            
            # 다음 매수가 계산 (현재가에서 매수 목표 하락률 적용)
            next_buy_price = current_price * (1 - self.config["buy_target"])
            
            # 다음 매도가 계산 (보유 중일 때만)
            if self.portfolio["holdings"] > 0 and self.portfolio["avg_price"] > 0:
                next_sell_price = self.portfolio["avg_price"] * (1 + self.config["sell_target"])
                
                # 현재 매도 조건 확인
                if current_price >= next_sell_price:
                    current_signal = "SELL"
            
            # 현재 매수 조건 확인
            latest_change = latest_data.get("changePercent", 0)
            if (abs(latest_change) >= self.config["buy_target"] * 100 and 
                latest_change < 0 and 
                self.portfolio["cash"] >= self.base_amount):
                current_signal = "BUY"
        
        return {
            "current_signal": current_signal,
            "next_buy_price": next_buy_price,
            "next_sell_price": next_sell_price,
            "cash_remaining": self.portfolio["cash"],
            "current_holdings": self.portfolio["holdings"],
            "avg_price": self.portfolio["avg_price"],
            "total_assets": self.portfolio["cash"] + (self.portfolio["holdings"] * price_data[-1]["price"] if price_data else 0),
            "return_rate": ((self.portfolio["cash"] + (self.portfolio["holdings"] * price_data[-1]["price"] if price_data else 0) - self.initial_capital) / self.initial_capital) * 100,
            "trades": trades
        }
    
    def calculate_summary(self, trades: List[Dict[str, Any]]) -> Dict[str, Any]:
        """거래 요약 통계 계산"""
        if not trades:
            return self._empty_summary()
        
        # 거래 분류
        buy_trades = [t for t in trades if t["action"] == "BUY"]
        sell_trades = [t for t in trades if t["action"] == "SELL"]
        profitable_trades = [t for t in sell_trades if t["profit"] > 0]
        
        # 기본 통계
        total_trades = len(buy_trades) + len(sell_trades)
        win_rate = (len(profitable_trades) / len(sell_trades) * 100) if sell_trades else 0
        
        # 평균 수익/손실
        avg_win = (sum(t["profit"] for t in profitable_trades) / len(profitable_trades)) if profitable_trades else 0
        avg_loss = (sum(t["profit"] for t in sell_trades if t["profit"] < 0) / len([t for t in sell_trades if t["profit"] < 0])) if len([t for t in sell_trades if t["profit"] < 0]) > 0 else 0
        
        # 총 수수료
        total_commission = sum(t["commission"] for t in trades)
        
        # 최종 수익률
        final_return = trades[-1]["returnRate"] if trades else 0
        
        # 최대 낙폭
        max_drawdown = abs(min(t["drawdown"] for t in trades)) if trades else 0
        
        # 샤프 비율 계산 (간단한 버전)
        returns = [t["returnRate"] for t in trades if t["returnRate"] != 0]
        if len(returns) > 1:
            avg_return = np.mean(returns)
            std_return = np.std(returns)
            sharpe_ratio = avg_return / std_return if std_return > 0 else 0
        else:
            sharpe_ratio = 0
        
        return {
            "totalTrades": total_trades,
            "buyTrades": len(buy_trades),
            "sellTrades": len(sell_trades),
            "winRate": round(win_rate, 2),
            "avgWin": round(avg_win, 2),
            "avgLoss": round(avg_loss, 2),
            "totalCommission": round(total_commission, 2),
            "finalReturn": round(final_return, 2),
            "maxDrawdown": round(max_drawdown, 2),
            "sharpeRatio": round(sharpe_ratio, 2)
        }
    
    def _empty_summary(self) -> Dict[str, Any]:
        """빈 요약 통계"""
        return {
            "totalTrades": 0,
            "buyTrades": 0,
            "sellTrades": 0,
            "winRate": 0.0,
            "avgWin": 0.0,
            "avgLoss": 0.0,
            "totalCommission": 0.0,
            "finalReturn": 0.0,
            "maxDrawdown": 0.0,
            "sharpeRatio": 0.0
        }
    
    def get_strategy_description(self) -> Dict[str, Any]:
        """전략 설명 반환"""
        descriptions = {
            "safe": {
                "name": "안전모드",
                "description": "보수적인 매매로 안정적인 수익 추구",
                "buyCondition": f"{self.config['buy_target']*100}% 이상 하락 시 매수",
                "sellCondition": f"{self.config['sell_target']*100}% 수익 시 매도",
                "riskLevel": "중간",
                "expectedReturn": "연 15-25%",
                "maxDrawdown": "20-30%"
            },
            "aggressive": {
                "name": "공세모드",
                "description": "적극적인 매매로 높은 수익 추구",
                "buyCondition": f"{self.config['buy_target']*100}% 이상 하락 시 매수",
                "sellCondition": f"{self.config['sell_target']*100}% 수익 시 매도",
                "riskLevel": "높음",
                "expectedReturn": "연 30-50%",
                "maxDrawdown": "40-60%"
            }
        }
        
        return descriptions.get(self.mode, descriptions["safe"])