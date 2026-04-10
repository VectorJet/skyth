import json
import re
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from typing import Any, Dict, List, Generator, Optional, AsyncGenerator
import numpy as np
import asyncio

from backend.base_classes.basepipeline import BasePipeline
from backend.base_classes.basetool import BaseTool # Type hinting only
from backend.converters.provider import generate_response, Provider

# Common well-known tickers to skip LLM lookup
KNOWN_TICKERS = {
    'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'BRK.A',
    'V', 'JNJ', 'WMT', 'JPM', 'MA', 'PG', 'UNH', 'DIS', 'HD', 'BAC', 'XOM', 'NFLX',
    'ADBE', 'CRM', 'CMCSA', 'PFE', 'KO', 'PEP', 'CSCO', 'VZ', 'TMO', 'INTC', 'ABT',
    'NKE', 'AVGO', 'TXN', 'QCOM', 'DHR', 'ACN', 'LLY', 'AMD', 'ORCL', 'IBM', 'PYPL'
}

class StockPipeline(BasePipeline):
    """
    Provides comprehensive stock data and prepares data for interactive charts.
    Efficiently identifies stock tickers and provides insightful analysis.
    """

    @property
    def name(self) -> str:
        return "stock_analyzer"

    @property
    def description(self) -> str:
        return "Use when the user asks about a specific stock price, performance, or requests a chart for a ticker symbol."

    async def run(self, initial_input: Any) -> AsyncGenerator[Any, None]:
        """
        Main execution flow.
        """
        # Unwrap query if it's a dict
        query = initial_input
        if isinstance(initial_input, dict):
            query = initial_input.get("query", "")
        
        # We need an API key for LLM calls (ticker resolution, summary)
        # Using configured provider via 'generate_response' is better than direct API key usage.
        
        # 1. Resolve Ticker
        ticker_symbol = await self._resolve_ticker(query)
        
        if not ticker_symbol:
            yield "I couldn't identify a company or ticker in your query. Please try a more specific company name or ticker symbol."
            return

        # 2. Fetch Data (Blocking I/O in thread)
        loop = asyncio.get_running_loop()
        
        def blocking_fetch():
            stock_obj = yf.Ticker(ticker_symbol)
            info = stock_obj.info
            hist = self._fetch_yfinance_history(stock_obj)
            return stock_obj, info, hist
            
        stock_obj, info, hist = await loop.run_in_executor(None, blocking_fetch)

        if hist is None:
            yield f"Sorry, I found the ticker '{ticker_symbol}' but couldn't retrieve its financial history."
            return

        # 3. Generate Summary (Streaming)
        async for chunk in self._generate_llm_summary(info, hist, ticker_symbol):
            yield chunk

        # 4. Prepare Chart Data (Background)
        # We don't stream the large JSON chart data to text output usually, 
        # but in the old system it yielded an 'artifact'.
        # For compatibility with new standardized flow, we'll return it as a structured JSON string or object
        # at the end, or yield a special marker if the frontend supports it.
        # Assuming we just return text + maybe a JSON block at the end.
        
        def blocking_charts():
            current_price = info.get('currentPrice') or info.get('regularMarketPrice', 0)
            if current_price == 0 and not hist.empty: current_price = float(hist['Close'].iloc[-1])
            prev_close = info.get('previousClose', float(hist['Close'].iloc[-2]) if len(hist) > 1 else current_price)
            change = current_price - prev_close
            change_percent = (change / prev_close) * 100 if prev_close else 0

            base_artifact_content = {
                "info": {
                    "longName": info.get('longName', ticker_symbol), "symbol": ticker_symbol, 
                    "currentPrice": float(current_price), "change": float(change), 
                    "changePercent": float(change_percent), "currency": info.get("currency", "USD")
                }, 
                "chartData": {}
            }
            
            all_ranges = ["1D", "5D", "1M", "6M", "YTD", "1Y", "MAX"]
            for range_name in all_ranges:
                if range_data := self._prepare_single_range(hist, ticker_symbol, range_name):
                    base_artifact_content["chartData"][range_name] = range_data
            
            return base_artifact_content

        chart_data = await loop.run_in_executor(None, blocking_charts)
        
        if chart_data["chartData"]:
            yield {
                "type": "artifacts",
                "data": [{
                    "id": f"stock_chart_{ticker_symbol}",
                    "type": "stock_chart_data",
                    "content": chart_data
                }]
            }
        else:
            yield "\n\n(Chart data unavailable)"

    def _extract_ticker_or_name(self, query: str) -> str:
        # Same regex logic
        ticker_match = re.search(r'\b([A-Z0-9\.\-\^]{2,10})\b', query, re.IGNORECASE)
        if ticker_match:
            return ticker_match.group(1).upper()
        stop_words = ['stock', 'price', 'chart', 'show', 'me', 'get', 'what', 'is', 'the', 'of', 'condition', 'performance', 'how', 'doing', 'for']
        words = query.lower().split()
        cleaned = ' '.join([w for w in words if w not in stop_words])
        return cleaned.strip().title()

    async def _resolve_ticker(self, query: str) -> Optional[str]:
        entity = self._extract_ticker_or_name(query)
        if not entity: return None
        
        loop = asyncio.get_running_loop()
        
        # 1. Direct Validation
        def validate(t):
            try:
                stock = yf.Ticker(t)
                info = stock.info
                if info and (info.get('regularMarketPrice') is not None or info.get('currentPrice') is not None):
                    return t
            except: pass
            return None
            
        valid = await loop.run_in_executor(None, validate, entity)
        if valid: return valid
        
        # 2. LLM Guess (using Provider)
        prompt = f"What is the stock ticker symbol for '{entity}'? Return ONLY the symbol (e.g. AAPL) or NULL."
        try:
            # We use a default fast model for utility
            config = Provider.load_config()
            model_id = config.get("small_model") or config.get("model") or "openai/gpt-3.5-turbo"
            
            response = await generate_response(
                model_id=model_id,
                messages=[{"role": "user", "content": prompt}],
                stream=False
            )
            # Handle response type (might be object or string depending on Provider implementation update, usually object)
            content = ""
            if hasattr(response, "choices"):
                content = response.choices[0].message.content.strip()
            else:
                content = str(response).strip()
            
            ticker = content.replace("'", "").replace('"', "").strip().upper()
            if ticker and ticker != "NULL":
                 valid_llm = await loop.run_in_executor(None, validate, ticker)
                 if valid_llm: return valid_llm
                 
        except Exception as e:
            print(f"LLM ticker resolution failed: {e}")
            
        return None

    def _fetch_yfinance_history(self, ticker_obj: yf.Ticker) -> Optional[pd.DataFrame]:
        try:
            hist = ticker_obj.history(period="max", auto_adjust=True)
            return hist if not hist.empty else None
        except Exception:
            return None

    def _prepare_single_range(self, hist_df: pd.DataFrame, ticker: str, range_name: str) -> Optional[List[Dict[str, Any]]]:
        # Copied logic, ensures chart data formatting
        try:
            today = datetime.now()
            hist_df = hist_df.copy()
            if hist_df.index.tz is not None: 
                hist_df.index = hist_df.index.tz_convert(None)

            time_ranges_map = {
                "1D": (today - timedelta(days=1), "5m"), "5D": (today - timedelta(days=5), "30m"),
                "1M": (today - timedelta(days=30), "1d"), "6M": (today - timedelta(days=180), "1d"),
                "YTD": (datetime(today.year, 1, 1), "1d"), "1Y": (today - timedelta(days=365), "1d"),
                "MAX": (None, "1d")
            }
            start_date, interval = time_ranges_map[range_name]
            
            # Simple slicing for now, avoiding yf.download inside loop to speed up
            df_range = hist_df.loc[hist_df.index >= start_date].copy() if start_date else hist_df.copy()
            
            if df_range.empty: return None
            
            required_cols = ['Open', 'High', 'Low', 'Close', 'Volume']
            for col in required_cols:
                if col not in df_range.columns: return None
            
            df_range.reset_index(inplace=True)
            date_col = next((col for col in ['Date', 'Datetime', 'index'] if col in df_range.columns), df_range.columns[0])
            df_range['date'] = pd.to_datetime(df_range[date_col]).dt.strftime('%Y-%m-%d %H:%M:%S')
            df_range = df_range.fillna(0)
            
            def safe_float(v): return float(v) if not pd.isna(v) else 0.0
            def safe_int(v): return int(v) if not pd.isna(v) else 0
            
            result = [{
                "date": str(row['date']), "Open": safe_float(row['Open']),
                "High": safe_float(row['High']), "Low": safe_float(row['Low']),
                "Close": safe_float(row['Close']), "Volume": safe_int(row['Volume'])
            } for _, row in df_range.iterrows()]
            
            return result
        except Exception:
            return None

    async def _generate_llm_summary(self, info: Dict, hist: pd.DataFrame, ticker_symbol: str) -> AsyncGenerator[str, None]:
        current_price = info.get('currentPrice') or info.get('regularMarketPrice', 0)
        if current_price == 0 and not hist.empty:
            current_price = float(hist['Close'].iloc[-1])
            
        summary_prompt = f"Generate a financial summary for {info.get('longName', ticker_symbol)} ({ticker_symbol}). Current Price: ${current_price}. Provide: 1. Recent Performance 2. Key Metrics 3. Brief Analysis."
        
        config = Provider.load_config()
        model_id = config.get("model") or "openai/gpt-4o"
        
        try:
            response_gen = await generate_response(
                model_id=model_id,
                messages=[{"role": "user", "content": summary_prompt}],
                stream=True
            )
            
            async for chunk in response_gen:
                 if hasattr(chunk, 'choices') and chunk.choices:
                        delta = chunk.choices[0].delta
                        if hasattr(delta, 'content') and delta.content:
                            yield delta.content
        except Exception as e:
            yield f"\n\n(Summary generation failed: {e})"
