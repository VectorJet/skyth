#!/usr/bin/env python3
"""
Stock data pipeline - fetches stock data using yfinance and generates graphs
"""

import sys
import json
import yfinance as yf
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from datetime import datetime

def get_metadata():
    """Return pipeline metadata"""
    return {
        "name": "stock_py",
        "description": "Fetch stock data using yfinance and optionally generate a graph (Python implementation)",
        "parameters": [
            {
                "name": "ticker",
                "description": "Stock ticker symbol (e.g., AAPL, GOOGL, TSLA)",
                "type": "string",
                "required": True
            },
            {
                "name": "period",
                "description": "Time period for historical data (default: 1mo)",
                "type": "string",
                "required": False,
                "enum": ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"]
            },
            {
                "name": "interval",
                "description": "Data interval (default: 1d)",
                "type": "string",
                "required": False,
                "enum": ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"]
            },
            {
                "name": "includeGraph",
                "description": "Generate a price graph (default: true)",
                "type": "boolean",
                "required": False
            }
        ],
        "category": "finance",
        "tags": ["stock", "finance", "yfinance", "market"]
    }

def fetch_stock_data(ticker, period="1mo", interval="1d", include_graph=True):
    """Fetch stock data and optionally generate a graph"""
    try:
        # Get ticker object
        stock = yf.Ticker(ticker)
        
        # Get historical data
        hist = stock.history(period=period, interval=interval)
        
        if hist.empty:
            return {
                "success": False,
                "error": f"No data found for ticker {ticker}"
            }
        
        # Get stock info
        info = stock.info
        
        # Prepare result
        result = {
            "success": True,
            "ticker": ticker,
            "info": {
                "longName": info.get("longName", "N/A"),
                "currentPrice": info.get("currentPrice", info.get("regularMarketPrice", "N/A")),
                "currency": info.get("currency", "USD"),
                "marketCap": info.get("marketCap", "N/A"),
                "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh", "N/A"),
                "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow", "N/A"),
                "volume": info.get("volume", "N/A"),
            },
            "history": {
                "dates": hist.index.strftime("%Y-%m-%d").tolist(),
                "open": hist["Open"].tolist(),
                "high": hist["High"].tolist(),
                "low": hist["Low"].tolist(),
                "close": hist["Close"].tolist(),
                "volume": hist["Volume"].tolist(),
            }
        }
        
        # Generate graph if requested
        if include_graph:
            try:
                timestamp = int(datetime.now().timestamp() * 1000)
                graph_path = f"/tmp/stock_{ticker}_{timestamp}.png"
                
                plt.figure(figsize=(12, 6))
                plt.plot(hist.index, hist["Close"], label="Close Price", linewidth=2, color='#2E86AB')
                plt.fill_between(hist.index, hist["Low"], hist["High"], alpha=0.3, label="High-Low Range", color='#A23B72')
                plt.title(f"{ticker} Stock Price ({period})", fontsize=16, fontweight='bold')
                plt.xlabel("Date", fontsize=12)
                plt.ylabel(f"Price ({result['info']['currency']})", fontsize=12)
                plt.legend()
                plt.grid(True, alpha=0.3)
                plt.tight_layout()
                plt.savefig(graph_path, dpi=150, bbox_inches='tight')
                plt.close()
                
                result["graph"] = graph_path
            except Exception as e:
                result["graphError"] = str(e)
        
        result["summary"] = f"Fetched {len(hist)} data points for {ticker} ({result['info']['longName']})"
        
        return result
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

def main():
    """Main entry point"""
    if len(sys.argv) > 1:
        if sys.argv[1] == "--metadata":
            # Return metadata
            print(json.dumps(get_metadata()))
            sys.exit(0)
        else:
            # Parse arguments
            try:
                args = json.loads(sys.argv[1])
            except json.JSONDecodeError:
                print(json.dumps({"success": False, "error": "Invalid JSON arguments"}), file=sys.stderr)
                sys.exit(1)
            
            # Extract parameters
            ticker = args.get("ticker")
            if not ticker:
                print(json.dumps({"success": False, "error": "ticker parameter is required"}), file=sys.stderr)
                sys.exit(1)
            
            period = args.get("period", "1mo")
            interval = args.get("interval", "1d")
            include_graph = args.get("includeGraph", True)
            
            # Fetch stock data
            result = fetch_stock_data(ticker, period, interval, include_graph)
            
            # Output result
            print(json.dumps(result))
            
            if not result.get("success"):
                sys.exit(1)
    else:
        print(json.dumps({"success": False, "error": "No arguments provided"}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
