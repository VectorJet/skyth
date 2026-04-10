"use client";

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ContextMenuItem {
  label: string;
  icon?: any;
  onClick: () => void;
  className?: string;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position?: { x: number; y: number };
  triggerRef?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}

const ContextMenu = ({ items, position, triggerRef, onClose }: ContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState(position || { x: 0, y: 0 });

  useEffect(() => {
    if (triggerRef?.current && !position) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Position above the trigger by default for footer menus
      setCoords({ 
        x: rect.left, 
        y: rect.top - (items.length * 40) - 10 // Approximate height calculation
      });
    }
  }, [triggerRef, position, items.length]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Adjust position to keep in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newX = coords.x;
      let newY = coords.y;

      if (rect.right > viewportWidth) newX = viewportWidth - rect.width - 10;
      if (rect.bottom > viewportHeight) newY = viewportHeight - rect.height - 10;
      if (newY < 0) newY = 10; // Prevent going off top

      if (newX !== coords.x || newY !== coords.y) {
        setCoords({ x: newX, y: newY });
      }
    }
  }, [coords]);

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[160px] bg-surface/95 backdrop-blur-xl border border-border-color rounded-xl shadow-xl py-1 animate-context-menu-in origin-bottom-left"
      style={{ top: coords.y, left: coords.x }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          onClick={(e) => {
            e.stopPropagation();
            item.onClick();
            onClose();
          }}
          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent-color/10 transition-colors ${item.className || 'text-primary-text'}`}
        >
          {item.icon && <item.icon className="w-4 h-4" />}
          {item.label}
        </button>
      ))}
    </div>
  );

  return createPortal(menu, document.body);
};

export default ContextMenu;