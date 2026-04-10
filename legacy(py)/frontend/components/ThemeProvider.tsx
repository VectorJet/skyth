// components/ThemeProvider.tsx
"use client";

import { useUser } from "@/context/UserContext";
import { useEffect } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();

  useEffect(() => {
    if (!user) return;

    const root = document.documentElement;
    const theme = user.color_scheme;

    // Apply theme from user profile
    if (theme === 'dark') {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else { // system
      localStorage.removeItem('theme'); // Let the inline script handle system preference
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }

    // Apply accent color
    if (user.accent_color) {
      root.style.setProperty('--accent-color', user.accent_color);
      root.style.setProperty('--active-color', user.accent_color);
    }

  }, [user]);

  return <>{children}</>;
}