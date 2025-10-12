from typing import List, Dict, Any
from datetime import datetime, timedelta
from .dongpa_engine import DongpaEngine
from models.schemas import DongpaConfig, BacktestResponse, Trade, TradingSummary

class BacktestingService:
    """백테스팅 서비스"""
    
    def __init__(self):
        pass
    
    def run_backtest(self, data: List[Dict[str, Any]], config: DongpaConfig) -> BacktestResponse:
        """백테스팅 실행"""
        # 동파법 엔진 초기화
        engine = DongpaEngine(
            initial_capital=config.initialCapital,
            divisions=config.divisions,
            mode=config.mode
        )
        
        # 신호 계산
        result = engine.calculate_signals(data)
        trades_data = result["trades"]
        
        # Trade 모델로 변환
        trades = []
        for trade_data in trades_data:
            trades.append(Trade(
                date=trade_data["date"],
                price=trade_data["price"],
                change=trade_data["change"],
                action=trade_data["action"],
                quantity=trade_data["quantity"],
                amount=trade_data["amount"],
                commission=trade_data["commission"],
                profit=trade_data["profit"],
                cash=trade_data["cash"],
                holdings=trade_data["holdings"],
                avgPrice=trade_data["avgPrice"],
                currentValue=trade_data["currentValue"],
                totalAssets=trade_data["totalAssets"],
                returnRate=trade_data["returnRate"],
                drawdown=trade_data["drawdown"]
            ))
        
        # 요약 통계 계산
        summary_data = engine.calculate_summary(trades_data)
        summary = TradingSummary(**summary_data)
        
        # 백테스팅 기간 계산
        period = {
            "start": data[0]["date"] if data else "",
            "end": data[-1]["date"] if data else "",
            "days": str(len(data))
        }
        
        return BacktestResponse(
            trades=trades,
            summary=summary,
            config=config,
            period=period
        )
    
    def compare_strategies(self, data: List[Dict[str, Any]], initial_capital: float = 10000) -> Dict[str, Any]:
        """전략 비교 분석"""
        results = {}
        
        # 안전모드 vs 공세모드 비교
        for mode in ["safe", "aggressive"]:
            for divisions in [5, 7, 10]:
                config = DongpaConfig(
                    initialCapital=initial_capital,
                    divisions=divisions,
                    mode=mode
                )
                
                result = self.run_backtest(data, config)
                key = f"{mode}_{divisions}div"
                
                results[key] = {
                    "config": {
                        "mode": mode,
                        "divisions": divisions,
                        "initialCapital": initial_capital
                    },
                    "performance": {
                        "finalReturn": result.summary.finalReturn,
                        "maxDrawdown": result.summary.maxDrawdown,
                        "winRate": result.summary.winRate,
                        "sharpeRatio": result.summary.sharpeRatio,
                        "totalTrades": result.summary.totalTrades
                    }
                }
        
        # 최적 전략 찾기
        best_strategy = self._find_best_strategy(results)
        
        return {
            "results": results,
            "bestStrategy": best_strategy,
            "analysis": self._generate_analysis(results)
        }
    
    def _find_best_strategy(self, results: Dict[str, Any]) -> Dict[str, Any]:
        """최적 전략 찾기 (샤프 비율 기준)"""
        best_key = None
        best_score = -999
        
        for key, result in results.items():
            perf = result["performance"]
            # 복합 점수 계산 (수익률 + 샤프비율 - MDD/2)
            score = perf["finalReturn"] + perf["sharpeRatio"] * 10 - perf["maxDrawdown"] / 2
            
            if score > best_score:
                best_score = score
                best_key = key
        
        return {
            "strategy": best_key,
            "score": best_score,
            "config": results[best_key]["config"] if best_key else {},
            "performance": results[best_key]["performance"] if best_key else {}
        }
    
    def _generate_analysis(self, results: Dict[str, Any]) -> Dict[str, Any]:
        """결과 분석 생성"""
        safe_results = {k: v for k, v in results.items() if "safe" in k}
        aggressive_results = {k: v for k, v in results.items() if "aggressive" in k}
        
        # 모드별 평균 성과
        safe_avg = self._calculate_average_performance(safe_results)
        aggressive_avg = self._calculate_average_performance(aggressive_results)
        
        # 분할 수별 성과
        division_analysis = self._analyze_by_divisions(results)
        
        return {
            "modeComparison": {
                "safe": safe_avg,
                "aggressive": aggressive_avg,
                "recommendation": "safe" if safe_avg["sharpeRatio"] > aggressive_avg["sharpeRatio"] else "aggressive"
            },
            "divisionAnalysis": division_analysis,
            "summary": {
                "bestMode": "safe" if safe_avg["finalReturn"] > aggressive_avg["finalReturn"] else "aggressive",
                "bestDivisions": division_analysis["bestDivisions"],
                "riskAssessment": self._assess_risk(results)
            }
        }
    
    def _calculate_average_performance(self, results: Dict[str, Any]) -> Dict[str, float]:
        """평균 성과 계산"""
        if not results:
            return {"finalReturn": 0, "maxDrawdown": 0, "winRate": 0, "sharpeRatio": 0}
        
        performances = [r["performance"] for r in results.values()]
        
        return {
            "finalReturn": sum(p["finalReturn"] for p in performances) / len(performances),
            "maxDrawdown": sum(p["maxDrawdown"] for p in performances) / len(performances),
            "winRate": sum(p["winRate"] for p in performances) / len(performances),
            "sharpeRatio": sum(p["sharpeRatio"] for p in performances) / len(performances)
        }
    
    def _analyze_by_divisions(self, results: Dict[str, Any]) -> Dict[str, Any]:
        """분할 수별 분석"""
        division_results = {}
        
        for divisions in [5, 7, 10]:
            div_results = {k: v for k, v in results.items() if f"_{divisions}div" in k}
            avg_perf = self._calculate_average_performance(div_results)
            division_results[str(divisions)] = avg_perf
        
        # 최적 분할 수 찾기
        best_divisions = "7"
        best_score = -999
        
        for div, perf in division_results.items():
            score = perf["finalReturn"] + perf["sharpeRatio"] * 10 - perf["maxDrawdown"] / 2
            if score > best_score:
                best_score = score
                best_divisions = div
        
        return {
            "results": division_results,
            "bestDivisions": best_divisions,
            "analysis": "분할 수가 많을수록 안정성은 증가하지만 기회비용도 커집니다."
        }
    
    def _assess_risk(self, results: Dict[str, Any]) -> str:
        """위험도 평가"""
        avg_mdd = sum(r["performance"]["maxDrawdown"] for r in results.values()) / len(results)
        avg_return = sum(r["performance"]["finalReturn"] for r in results.values()) / len(results)
        
        if avg_mdd < 20 and avg_return > 0:
            return "낮은 위험도 - 안정적인 수익 기대"
        elif avg_mdd < 35 and avg_return > 15:
            return "중간 위험도 - 적절한 위험 대비 수익"
        else:
            return "높은 위험도 - 변동성이 큰 전략"
    
    def generate_report(self, backtest_result: BacktestResponse) -> Dict[str, Any]:
        """백테스팅 리포트 생성"""
        trades = backtest_result.trades
        summary = backtest_result.summary
        config = backtest_result.config
        
        # 월별 성과 분석
        monthly_performance = self._analyze_monthly_performance(trades)
        
        # 연속 손익 분석
        consecutive_analysis = self._analyze_consecutive_trades(trades)
        
        # 위험 지표
        risk_metrics = self._calculate_risk_metrics(trades)
        
        # 권장사항
        recommendations = self._generate_recommendations(summary, config)
        
        return {
            "overview": {
                "period": backtest_result.period,
                "totalReturn": summary.finalReturn,
                "winRate": summary.winRate,
                "maxDrawdown": summary.maxDrawdown,
                "sharpeRatio": summary.sharpeRatio
            },
            "monthlyPerformance": monthly_performance,
            "consecutiveAnalysis": consecutive_analysis,
            "riskMetrics": risk_metrics,
            "recommendations": recommendations
        }
    
    def _analyze_monthly_performance(self, trades: List[Trade]) -> List[Dict[str, Any]]:
        """월별 성과 분석"""
        monthly_data = {}
        
        for trade in trades:
            month_key = trade.date[:7]  # YYYY-MM
            if month_key not in monthly_data:
                monthly_data[month_key] = {
                    "month": month_key,
                    "trades": 0,
                    "profit": 0.0,
                    "return": 0.0
                }
            
            if trade.action in ["BUY", "SELL"]:
                monthly_data[month_key]["trades"] += 1
                if trade.action == "SELL":
                    monthly_data[month_key]["profit"] += trade.profit
        
        # 월별 수익률 계산
        for month_data in monthly_data.values():
            if month_data["trades"] > 0:
                month_data["return"] = (month_data["profit"] / (month_data["trades"] * 1000)) * 100  # 간단한 계산
        
        return sorted(monthly_data.values(), key=lambda x: x["month"])
    
    def _analyze_consecutive_trades(self, trades: List[Trade]) -> Dict[str, Any]:
        """연속 손익 분석"""
        sell_trades = [t for t in trades if t.action == "SELL"]
        
        if not sell_trades:
            return {"maxWinStreak": 0, "maxLossStreak": 0, "currentStreak": 0}
        
        win_streak = 0
        loss_streak = 0
        max_win_streak = 0
        max_loss_streak = 0
        current_streak = 0
        
        for trade in sell_trades:
            if trade.profit > 0:
                win_streak += 1
                loss_streak = 0
                current_streak = win_streak
                max_win_streak = max(max_win_streak, win_streak)
            else:
                loss_streak += 1
                win_streak = 0
                current_streak = -loss_streak
                max_loss_streak = max(max_loss_streak, loss_streak)
        
        return {
            "maxWinStreak": max_win_streak,
            "maxLossStreak": max_loss_streak,
            "currentStreak": current_streak
        }
    
    def _calculate_risk_metrics(self, trades: List[Trade]) -> Dict[str, float]:
        """위험 지표 계산"""
        if not trades:
            return {"var95": 0.0, "cvar95": 0.0, "volatility": 0.0}
        
        returns = [t.returnRate for t in trades if t.returnRate != 0]
        
        if len(returns) < 2:
            return {"var95": 0.0, "cvar95": 0.0, "volatility": 0.0}
        
        import numpy as np
        
        # VaR (95% 신뢰구간)
        var_95 = np.percentile(returns, 5)
        
        # CVaR (조건부 VaR)
        cvar_95 = np.mean([r for r in returns if r <= var_95]) if any(r <= var_95 for r in returns) else 0
        
        # 변동성 (표준편차)
        volatility = np.std(returns)
        
        return {
            "var95": round(var_95, 2),
            "cvar95": round(cvar_95, 2),
            "volatility": round(volatility, 2)
        }
    
    def _generate_recommendations(self, summary: TradingSummary, config: DongpaConfig) -> List[str]:
        """권장사항 생성"""
        recommendations = []
        
        # 수익률 기반 권장사항
        if summary.finalReturn < 5:
            recommendations.append("낮은 수익률입니다. 더 공격적인 모드를 고려해보세요.")
        elif summary.finalReturn > 30:
            recommendations.append("높은 수익률을 달성했습니다. 현재 전략을 유지하세요.")
        
        # 승률 기반 권장사항
        if summary.winRate < 50:
            recommendations.append("승률이 낮습니다. 매도 목표를 낮춰 보세요.")
        elif summary.winRate > 70:
            recommendations.append("높은 승률을 보이고 있습니다. 매도 목표를 높여 더 큰 수익을 노려보세요.")
        
        # MDD 기반 권장사항
        if summary.maxDrawdown > 40:
            recommendations.append("최대낙폭이 큽니다. 안전모드로 변경하거나 분할 수를 늘려보세요.")
        elif summary.maxDrawdown < 15:
            recommendations.append("안정적인 전략입니다. 더 적극적인 투자를 고려해보세요.")
        
        # 거래 빈도 기반 권장사항
        if summary.totalTrades < 10:
            recommendations.append("거래 빈도가 낮습니다. 더 민감한 매수 조건을 설정해보세요.")
        elif summary.totalTrades > 50:
            recommendations.append("거래가 너무 빈번합니다. 매수 조건을 더 엄격하게 설정해보세요.")
        
        return recommendations if recommendations else ["현재 전략이 균형잡혀 있습니다."]