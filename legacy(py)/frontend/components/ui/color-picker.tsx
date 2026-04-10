// components/ui/color-picker.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from './popover';

// --- Color Conversion Utilities ---
const hexToHsl = (hex: string): { h: number; s: number; l: number } => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 0, l: 0 };

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
};

const hslToHex = (h: number, s: number, l: number): string => {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};
// --- End Color Conversion ---

export const ColorPicker = ({ value, onChange }: { value: string; onChange: (color: string) => void }) => {
  const [hsl, setHsl] = useState(hexToHsl(value));
  const wheelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHsl(hexToHsl(value));
  }, [value]);
  
  const handleColorChange = useCallback((newHsl: { h: number; s: number; l: number }) => {
    setHsl(newHsl);
    onChange(hslToHex(newHsl.h, newHsl.s, newHsl.l));
  }, [onChange]);

  const handleHueInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    if (!wheelRef.current) return;
    const rect = wheelRef.current.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const angle = Math.atan2(clientY - centerY, clientX - (rect.left + rect.width / 2));
    let degrees = Math.round(angle * (180 / Math.PI));
    if (degrees < 0) degrees += 360;
    handleColorChange({ ...hsl, h: degrees });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleHueInteraction(e);
    const onMouseMove = (moveE: MouseEvent) => handleHueInteraction(moveE as unknown as React.MouseEvent);
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-20 h-10 p-1 rounded-xl border border-border-color cursor-pointer"
          style={{ backgroundColor: value }}
        />
      </PopoverTrigger>
      <PopoverContent>
        <div 
          className="w-full space-y-4"
          style={{ '--hue': hsl.h } as React.CSSProperties}
        >
          <div className="relative w-full aspect-square">
            <div
              ref={wheelRef}
              onMouseDown={handleMouseDown}
              className="w-full h-full rounded-full cursor-pointer"
              style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
            >
              <div 
                className="absolute w-full h-full rounded-full"
                style={{ background: `radial-gradient(circle, transparent, hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, 0), white)`}}
              />
            </div>
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 border-white shadow-md pointer-events-none"
              style={{
                transform: `rotate(${hsl.h}deg) translateX(calc(50% - 12px)) rotate(-${hsl.h}deg) scale(1)`,
                backgroundColor: `hsl(${hsl.h}, 100%, 50%)`,
                left: '50%',
                top: '50%',
                marginLeft: '-12px',
                marginTop: '-12px',
                transformOrigin: '12px 12px'
              }}
            />
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary-text">Saturation</label>
              <input
                type="range"
                min="0"
                max="100"
                value={hsl.s}
                onChange={(e) => handleColorChange({ ...hsl, s: +e.target.value })}
                className="w-full h-2 rounded-full appearance-none cursor-pointer color-slider"
                style={{ background: `linear-gradient(to right, hsl(var(--hue), 0%, ${hsl.l}%), hsl(var(--hue), 100%, ${hsl.l}%))` }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary-text">Lightness</label>
              <input
                type="range"
                min="0"
                max="100"
                value={hsl.l}
                onChange={(e) => handleColorChange({ ...hsl, l: +e.target.value })}
                className="w-full h-2 rounded-full appearance-none cursor-pointer color-slider"
                style={{ background: `linear-gradient(to right, #000, hsl(var(--hue), ${hsl.s}%, 50%), #fff)` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border-color pt-3">
            <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: value }} />
            <input 
              type="text" 
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-full bg-input-bg/50 border border-border-color rounded-lg px-2 py-1 text-sm font-mono text-primary-text focus:outline-none focus:ring-2 focus:ring-accent-color"
            />
          </div>
        </div>
      </PopoverContent>
      <style jsx>{`
        .color-slider {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
        }
        .color-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffffff;
          border: 2px solid #e5e7eb;
          box-shadow: 0 0 4px rgba(0,0,0,0.3);
          cursor: pointer;
          margin-top: -3px; /* Center thumb */
        }
        .color-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffffff;
          border: 2px solid #e5e7eb;
          box-shadow: 0 0 4px rgba(0,0,0,0.3);
          cursor: pointer;
        }
      `}</style>
    </Popover>
  );
};