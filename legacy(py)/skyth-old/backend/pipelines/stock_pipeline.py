import json
import re
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from typing import Any, Dict, List, Generator, Optional
import numpy as np

from backend.baseline import BasePipeline
from backend.utils import yield_data
from backend.tools import call_llm
from backend.mcp_manager import MCPManager

# Common well-known tickers to skip LLM lookup
KNOWN_TICKERS = {
    "AAPL",
    "MSFT",
    "GOOGL",
    "GOOG",
    "AMZN",
    "NVDA",
    "META",
    "TSLA",
    "BRK.B",
    "BRK.A",
    "V",
    "JNJ",
    "WMT",
    "JPM",
    "MA",
    "PG",
    "UNH",
    "DIS",
    "HD",
    "BAC",
    "XOM",
    "NFLX",
    "ADBE",
    "CRM",
    "CMCSA",
    "PFE",
    "KO",
    "PEP",
    "CSCO",
    "VZ",
    "TMO",
    "INTC",
    "ABT",
    "NKE",
    "AVGO",
    "TXN",
    "QCOM",
    "DHR",
    "ACN",
    "LLY",
    "AMD",
    "ORCL",
    "IBM",
    "PYPL",
}


class StockPipeline(BasePipeline):
    """
    Provides comprehensive stock data and prepares data for interactive charts.
    Efficiently identifies stock tickers and provides insightful analysis.
    """

    def __init__(self, mcp_manager: Optional[MCPManager] = None):
        self.mcp_manager = mcp_manager

    @property
    def name(self) -> str:
        return "stock_analyzer"

    @property
    def description(self) -> str:
        return "Use when the user asks about a specific stock price, performance, or requests a chart for a ticker symbol."

    @property
    def parameters(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": "query",
                "type": "string",
                "description": "The user's query about a stock.",
            }
        ]

    def _extract_ticker_or_name(self, query: str) -> str:
        """Extract company name or ticker from query, prioritizing ticker-like strings."""
        # Try to find a ticker-like string first (e.g., AAPL, MSFT, BTC-USD, BTCUSD)
        ticker_match = re.search(r"\b([A-Z0-9\.\-\^]{2,10})\b", query, re.IGNORECASE)
        if ticker_match:
            return ticker_match.group(1).upper()

        # If not, clean up for a company name
        stop_words = [
            "stock",
            "price",
            "chart",
            "show",
            "me",
            "get",
            "what",
            "is",
            "the",
            "of",
            "condition",
            "performance",
            "how",
            "doing",
            "for",
        ]
        words = query.lower().split()
        cleaned = " ".join([w for w in words if w not in stop_words])
        return cleaned.strip().title()

    def _validate_ticker(self, ticker: str) -> Optional[yf.Ticker]:
        """Validate ticker by fetching its info."""
        if not ticker or not re.match(r"^[A-Z0-9\.\-\^]+$", ticker):
            return None
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            if info and (
                info.get("regularMarketPrice") is not None
                or info.get("currentPrice") is not None
                or info.get("market") == "ccc_market"
            ):
                return stock
        except Exception:
            pass
        return None

    def _get_ticker_from_llm(
        self, entity: str, api_key: str, utility_model: str
    ) -> List[str]:
        """Use LLM to find potential ticker symbols as a first guess."""
        prompt = f"""What is the stock ticker symbol for "{entity}"?

CRITICAL INSTRUCTIONS:
- Return ONLY valid stock ticker symbols (e.g., AAPL, TSLA, MSFT, BTC-USD)
- Do NOT return company names (e.g., "Apple" is WRONG, "AAPL" is CORRECT)
- Include exchange suffixes for international stocks (e.g., .NS for India)
- List up to 3 potential ticker symbols, separated by commas, in order of likelihood.
- If unsure, return "NULL".

Now find the ticker for: "{entity}"
Output ONLY the comma-separated ticker symbols or "NULL"."""

        try:
            response = call_llm(prompt, api_key, utility_model, stream=False)
            tickers_str = (
                response.json()["candidates"][0]["content"]["parts"][0]["text"]
                .strip()
                .upper()
            )
            if tickers_str == "NULL" or not tickers_str:
                return []

            potential_tickers = [
                t.strip()
                for t in tickers_str.split(",")
                if re.match(r"^[A-Z0-9\.\-\^]+$", t.strip())
            ]
            return potential_tickers
        except Exception as e:
            print(f"🔴 [Stock Pipeline] LLM ticker guess failed: {e}")
            return []

    def _search_web_for_ticker(
        self, entity: str, api_key: str, utility_model: str
    ) -> List[str]:
        """Use web search via MCP to find a ticker if other methods fail."""
        if not self.mcp_manager:
            return []
        try:
            search_query = f"official stock ticker symbol for {entity}"
            search_results = self.mcp_manager.execute_tool(
                "searxng_web_search", {"query": search_query}
            )

            if (
                not search_results
                or "results" not in search_results
                or not search_results["results"]
            ):
                return []

            context = "\n".join(
                [
                    f"Title: {res.get('title', '')}\nSnippet: {res.get('content', '')}"
                    for res in search_results["results"][:5]
                ]
            )

            prompt = f"""Based on the following web search results, what is the most likely stock ticker symbol for "{entity}"?

CRITICAL INSTRUCTIONS:
- Analyze the context to find the official ticker. Look for patterns like (NASDAQ: AAPL) or (NYSE: MSFT).
- Consider cryptocurrency pairs which often use formats like BTC-USD or ETH-EUR.
- Return ONLY the single most likely ticker symbol.
- If you are confident, return just the symbol (e.g., "AAPL" or "BTC-USD").
- If you are not confident or cannot find it, return "NULL".

Search Results Context:
---
{context[:4000]}
---

Most likely ticker for "{entity}": """

            response = call_llm(prompt, api_key, utility_model, stream=False)
            ticker = (
                response.json()["candidates"][0]["content"]["parts"][0]["text"]
                .strip()
                .upper()
            )

            if ticker and ticker != "NULL" and re.match(r"^[A-Z0-9\.\-\^]+$", ticker):
                return [ticker]
            return []
        except Exception as e:
            print(f"🔴 [Stock Pipeline] Web search for ticker failed: {e}")
            return []

    def _resolve_ticker(
        self, query: str, api_key: str, utility_model: str
    ) -> Generator[str, None, Optional[str]]:
        """Orchestrates the process of finding and validating a ticker symbol."""
        entity = self._extract_ticker_or_name(query)
        if not entity:
            yield yield_data(
                "answer_chunk", "I couldn't identify a company or ticker in your query."
            )
            return None

        # 1. Direct validation of the extracted entity
        yield yield_data(
            "thought", {"content": f"Attempting direct validation for '{entity}'..."}
        )
        if self._validate_ticker(entity):
            yield yield_data(
                "tool_result",
                {"tool": "yfinance.Ticker.info", "result": f"✓ Validated **{entity}**"},
            )
            return entity

        # Also try with a hyphen for common crypto pairs (e.g., BTCUSD -> BTC-USD)
        if len(entity) == 6 and "-" not in entity:
            hyphenated_entity = f"{entity[:3]}-{entity[3:]}"
            yield yield_data(
                "thought", {"content": f"Also trying '{hyphenated_entity}'..."}
            )
            if self._validate_ticker(hyphenated_entity):
                yield yield_data(
                    "tool_result",
                    {
                        "tool": "yfinance.Ticker.info",
                        "result": f"✓ Validated **{hyphenated_entity}**",
                    },
                )
                return hyphenated_entity
        yield yield_data(
            "tool_result",
            {
                "tool": "yfinance.Ticker.info",
                "result": f"✗ Direct validation failed for '{entity}'",
            },
        )

        # 2. Use LLM for a quick guess
        yield yield_data(
            "thought", {"content": f"Asking LLM for a ticker for '{entity}'..."}
        )
        potential_tickers = self._get_ticker_from_llm(entity, api_key, utility_model)
        if potential_tickers:
            yield yield_data(
                "thought", {"content": f"LLM suggested: {', '.join(potential_tickers)}"}
            )
            for ticker in potential_tickers:
                if self._validate_ticker(ticker):
                    yield yield_data(
                        "tool_result",
                        {
                            "tool": "yfinance.Ticker.info",
                            "result": f"✓ Validated LLM suggestion: **{ticker}**",
                        },
                    )
                    return ticker
                yield yield_data(
                    "tool_result",
                    {
                        "tool": "yfinance.Ticker.info",
                        "result": f"✗ Invalid LLM suggestion: {ticker}",
                    },
                )

        # 3. Fallback to web search
        yield yield_data(
            "thought",
            {
                "content": f"LLM guess failed. Searching the web for a ticker for '{entity}'..."
            },
        )
        web_tickers = self._search_web_for_ticker(entity, api_key, utility_model)
        if web_tickers:
            yield yield_data(
                "thought",
                {"content": f"Web search suggested: {', '.join(web_tickers)}"},
            )
            for ticker in web_tickers:
                if self._validate_ticker(ticker):
                    yield yield_data(
                        "tool_result",
                        {
                            "tool": "yfinance.Ticker.info",
                            "result": f"✓ Validated web search result: **{ticker}**",
                        },
                    )
                    return ticker
                yield yield_data(
                    "tool_result",
                    {
                        "tool": "yfinance.Ticker.info",
                        "result": f"✗ Invalid web search result: {ticker}",
                    },
                )

        return None

    def _fetch_yfinance_history(self, ticker_obj: yf.Ticker) -> Optional[pd.DataFrame]:
        try:
            hist = ticker_obj.history(period="max", auto_adjust=True)
            return hist if not hist.empty else None
        except Exception as e:
            print(f"🔴 [Stock Pipeline] History fetch error: {e}")
            return None

    def _safe_float(self, value: Any) -> float:
        """Safely convert any value to float, handling pandas types."""
        if isinstance(value, (pd.Series, np.ndarray)):
            if len(value) == 0:
                return 0.0
            val = value.iloc[0] if hasattr(value, "iloc") else value[0]
            return 0.0 if pd.isna(val) else float(val)
        return 0.0 if pd.isna(value) else float(value)

    def _safe_int(self, value: Any) -> int:
        """Safely convert any value to int, handling pandas types."""
        if isinstance(value, (pd.Series, np.ndarray)):
            if len(value) == 0:
                return 0
            val = value.iloc[0] if hasattr(value, "iloc") else value[0]
            return 0 if pd.isna(val) else int(val)
        return 0 if pd.isna(value) else int(value)

    def _prepare_single_range(
        self, hist_df: pd.DataFrame, ticker: str, range_name: str
    ) -> Optional[List[Dict[str, Any]]]:
        """Prepare chart data for a single time range."""
        try:
            today = datetime.now()
            hist_df = hist_df.copy()
            if hist_df.index.tz is not None:
                hist_df.index = hist_df.index.tz_convert(None)

            time_ranges_map = {
                "1D": (today - timedelta(days=1), "5m"),
                "5D": (today - timedelta(days=5), "30m"),
                "1M": (today - timedelta(days=30), "1d"),
                "6M": (today - timedelta(days=180), "1d"),
                "YTD": (datetime(today.year, 1, 1), "1d"),
                "1Y": (today - timedelta(days=365), "1d"),
                "MAX": (None, "1d"),
            }
            start_date, interval = time_ranges_map[range_name]

            if range_name in ["1D", "5D"]:
                df_range = yf.download(
                    ticker,
                    start=start_date,
                    interval=interval,
                    progress=False,
                    auto_adjust=True,
                )
                if isinstance(df_range.columns, pd.MultiIndex):
                    df_range.columns = df_range.columns.droplevel(1)
            else:
                df_range = (
                    hist_df.loc[hist_df.index >= start_date].copy()
                    if start_date
                    else hist_df.copy()
                )

            if df_range.empty:
                return None

            required_cols = ["Open", "High", "Low", "Close", "Volume"]
            for col in required_cols:
                if col not in df_range.columns:
                    return None

            df_range.reset_index(inplace=True)
            date_col = next(
                (
                    col
                    for col in ["Date", "Datetime", "index"]
                    if col in df_range.columns
                ),
                df_range.columns[0],
            )
            df_range["date"] = pd.to_datetime(df_range[date_col]).dt.strftime(
                "%Y-%m-%d %H:%M:%S"
            )
            df_range = df_range.fillna(0)

            result = [
                {
                    "date": str(row["date"]),
                    "Open": self._safe_float(row["Open"]),
                    "High": self._safe_float(row["High"]),
                    "Low": self._safe_float(row["Low"]),
                    "Close": self._safe_float(row["Close"]),
                    "Volume": self._safe_int(row["Volume"]),
                }
                for _, row in df_range.iterrows()
            ]

            print(
                f"✓ [Stock Pipeline] Prepared {len(result)} data points for {range_name}"
            )
            return result

        except Exception as e:
            print(f"🔴 [Stock Pipeline] Error processing {range_name}: {e}")
            import traceback

            traceback.print_exc()
            return None

    def _generate_llm_summary(
        self,
        info: Dict,
        hist: pd.DataFrame,
        ticker_symbol: str,
        api_key: str,
        utility_model: str,
    ) -> Generator[str, None, None]:
        """Generate a detailed, Perplexity-style financial summary."""
        try:
            yield yield_data(
                "thought",
                {"content": "Analyzing stock data for comprehensive summary..."},
            )

            current_price = info.get("currentPrice") or info.get(
                "regularMarketPrice", 0
            )
            if current_price == 0 and not hist.empty:
                current_price = float(hist["Close"].iloc[-1])

            prev_close = info.get(
                "previousClose",
                float(hist["Close"].iloc[-2]) if len(hist) > 1 else current_price,
            )
            change = current_price - prev_close
            change_percent = (change / prev_close) * 100 if prev_close else 0

            week_52_high = info.get("fiftyTwoWeekHigh", 0)
            week_52_low = info.get("fiftyTwoWeekLow", 0)
            distance_from_52w_high = (
                ((current_price - week_52_high) / week_52_high * 100)
                if week_52_high
                else 0
            )

            month_return = three_month_return = ytd_return = 0
            if len(hist) >= 20:
                month_return = (
                    (current_price - float(hist["Close"].iloc[-20]))
                    / float(hist["Close"].iloc[-20])
                    * 100
                )
            if len(hist) >= 60:
                three_month_return = (
                    (current_price - float(hist["Close"].iloc[-60]))
                    / float(hist["Close"].iloc[-60])
                    * 100
                )
            if len(hist) >= 252:
                ytd_return = (
                    (current_price - float(hist["Close"].iloc[-252]))
                    / float(hist["Close"].iloc[-252])
                    * 100
                )

            summary_prompt = f"""Generate a professional, insightful financial analysis for {info.get('longName', ticker_symbol)} ({ticker_symbol}), similar to Perplexity's style.

Format in clean Markdown with these sections:

1. **Opening paragraph**: Current price, today's change, and brief context about recent performance
2. **Recent Performance**: Discuss daily trading range, monthly/quarterly returns, and year-to-date performance
3. **Key Price Levels**: Analyze 52-week range, distance from highs/lows, and moving averages
4. **Valuation Metrics**: Discuss market cap, P/E ratio, beta, and what these mean for investors

Be analytical and data-driven. Use bold for key metrics. Start directly with analysis - no "Here's the analysis" phrases.

**Data:**
- **Current Price**: ${current_price:,.2f}
- **Daily Change**: ${change:+,.2f} ({change_percent:+.2f}%)
- **Day's Range**: ${info.get('dayLow', 0):,.2f} - ${info.get('dayHigh', 0):,.2f}
- **52-Week Range**: ${week_52_low:,.2f} - ${week_52_high:,.2f}
- **Distance from 52W High**: {distance_from_52w_high:.1f}%
- **1-Month Return**: {month_return:+.2f}%
- **3-Month Return**: {three_month_return:+.2f}%
- **YTD Return**: {ytd_return:+.2f}%
- **Market Cap**: ${info.get('marketCap', 0):,}
- **P/E Ratio**: {info.get('trailingPE', 'N/A')}
- **Beta**: {info.get('beta', 'N/A')}
- **50-Day MA**: ${info.get('fiftyDayAverage', 0):,.2f}
- **200-Day MA**: ${info.get('twoHundredDayAverage', 0):,.2f}
- **Volume**: {info.get('volume', 'N/A'):,}
- **Average Volume**: {info.get('averageVolume', 'N/A'):,}"""

            response = call_llm(summary_prompt, api_key, utility_model, stream=True)
            for line in response.iter_lines():
                if line.startswith(b"data: "):
                    try:
                        chunk_data = json.loads(line[6:])
                        text_chunk = (
                            chunk_data.get("candidates", [{}])[0]
                            .get("content", {})
                            .get("parts", [{}])[0]
                            .get("text", "")
                        )
                        if text_chunk:
                            yield yield_data("answer_chunk", text_chunk)
                    except (json.JSONDecodeError, IndexError):
                        continue
        except Exception as e:
            print(f"🔴 [Stock Pipeline] LLM summary generation failed: {e}")
            fallback_summary = f"Could not generate a detailed summary. **{ticker_symbol}** is trading at **${current_price:,.2f}** ({change_percent:+.2f}%)."
            yield yield_data("answer_chunk", fallback_summary)

    def execute(
        self,
        query: str,
        api_key: str,
        utility_model: str,
        instructions: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Generator[str, None, None]:
        ticker_symbol = yield from self._resolve_ticker(query, api_key, utility_model)

        if not ticker_symbol:
            yield yield_data(
                "answer_chunk",
                "I couldn't find a matching stock for your query. Please try a more specific company name or ticker symbol (e.g., 'AAPL' for Apple, 'TSLA' for Tesla).",
            )
            return

        stock_obj = yf.Ticker(ticker_symbol)
        info = stock_obj.info
        hist = self._fetch_yfinance_history(stock_obj)

        if hist is None:
            yield yield_data(
                "answer_chunk",
                f"Sorry, I found the ticker '{ticker_symbol}' but couldn't retrieve its financial history.",
            )
            return

        yield from self._generate_llm_summary(
            info, hist, ticker_symbol, api_key, utility_model
        )

        yield yield_data("thought", {"content": "Preparing interactive chart..."})

        current_price = info.get("currentPrice") or info.get("regularMarketPrice", 0)
        if current_price == 0 and not hist.empty:
            current_price = float(hist["Close"].iloc[-1])
        prev_close = info.get(
            "previousClose",
            float(hist["Close"].iloc[-2]) if len(hist) > 1 else current_price,
        )
        change = current_price - prev_close
        change_percent = (change / prev_close) * 100 if prev_close else 0

        base_artifact_content = {
            "info": {
                "longName": info.get("longName", ticker_symbol),
                "symbol": ticker_symbol,
                "currentPrice": float(current_price),
                "change": float(change),
                "changePercent": float(change_percent),
                "currency": info.get("currency", "USD"),
            },
            "chartData": {},
        }

        all_ranges = ["1D", "5D", "1M", "6M", "YTD", "1Y", "MAX"]
        for range_name in all_ranges:
            if range_data := self._prepare_single_range(
                hist, ticker_symbol, range_name
            ):
                base_artifact_content["chartData"][range_name] = range_data

        if base_artifact_content["chartData"]:
            yield yield_data(
                "artifacts",
                [
                    {
                        "id": f"stock_chart_{ticker_symbol}",
                        "type": "stock_chart_data",
                        "content": base_artifact_content,
                    }
                ],
            )
            yield yield_data(
                "thought",
                {
                    "content": f"Chart loaded with {len(base_artifact_content['chartData'])} timeframes."
                },
            )
        else:
            yield yield_data("thought", {"content": "⚠️ Unable to load chart data."})
