"use client";

import React, { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { StockChartData, StockDataPoint } from '@/types';
import { ArrowUp, ArrowDown, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const TIME_RANGES = ["1D", "5D", "1M", "6M", "YTD", "1Y", "MAX"];

export default function InteractiveStockChart({ data }: { data: StockChartData }) {
  // Determine available ranges based on data presence
  const availableRanges = TIME_RANGES.filter(r => data.chartData[r] && data.chartData[r].length > 0);
  const [activeRange, setActiveRange] = useState(availableRanges[0] || "1D");
  
  const chartData = useMemo(() => data.chartData[activeRange] || [], [data, activeRange]);
  
  const isPositive = data.info.change >= 0;
  const ColorIcon = isPositive ? TrendingUp : TrendingDown;
  const colorClass = isPositive ? "text-green-500" : "text-red-500";
  const strokeColor = isPositive ? "#22c55e" : "#ef4444";
  const fillColor = isPositive ? "url(#colorGreen)" : "url(#colorRed)";

  // Formatters
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (activeRange === "1D") return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatPrice = (price: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: data.info.currency }).format(price);

  return (
    <div className="bg-surface border border-border-color rounded-xl p-4 shadow-sm w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-sm text-secondary-text font-medium">{data.info.longName}</h3>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary-text">{formatPrice(data.info.currentPrice)}</span>
            <div className={`flex items-center text-sm font-medium ${colorClass}`}>
              {isPositive ? <ArrowUp className="w-3 h-3 mr-0.5" /> : <ArrowDown className="w-3 h-3 mr-0.5" />}
              {Math.abs(data.info.change).toFixed(2)} ({data.info.changePercent.toFixed(2)}%)
            </div>
          </div>
          <p className="text-xs text-secondary-text mt-1">{activeRange} Performance</p>
        </div>
        <div className="p-2 bg-surface rounded-lg border border-border-color">
          <ColorIcon className={`w-6 h-6 ${colorClass}`} />
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorRed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.1} />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate} 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--secondary-text-color)', fontSize: 10 }}
              minTickGap={30}
            />
            <YAxis 
              domain={['auto', 'auto']} 
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--secondary-text-color)', fontSize: 10 }}
              tickFormatter={(val) => val.toFixed(1)}
              width={40}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)', borderRadius: '8px', fontSize: '12px' }}
              itemStyle={{ color: 'var(--primary-text-color)' }}
              labelStyle={{ color: 'var(--secondary-text-color)', marginBottom: '4px' }}
              labelFormatter={(label) => new Date(label).toLocaleString()}
              formatter={(value: any) => [formatPrice(value as number), "Price"]}
            />
            <Area 
              type="monotone" 
              dataKey="Close" 
              stroke={strokeColor} 
              fillOpacity={1} 
              fill={fillColor} 
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-1 mt-4 justify-center bg-button-bg/30 p-1 rounded-lg w-fit mx-auto">
        {availableRanges.map(range => (
          <button
            key={range}
            onClick={() => setActiveRange(range)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-all",
              activeRange === range 
                ? "bg-surface text-primary-text shadow-sm" 
                : "text-secondary-text hover:text-primary-text hover:bg-surface/50"
            )}
          >
            {range}
          </button>
        ))}
      </div>
    </div>
  );
}