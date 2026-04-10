// components/GreetingAnimator.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { WordRotate } from '@/components/ui/word-rotate';
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text';
import { api } from '@/lib/api';
import { useUser } from '@/context/UserContext';

const DEFAULT_GREETINGS = ["Hello", "Hi there", "Welcome", "Greetings"];

export default function GreetingAnimator() {
  const { user } = useUser();
  const [greeting, setGreeting] = useState<string>("Hello");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    async function fetchGreeting() {
      if (!user) return;
      try {
        const res = await api('/user/greeting');
        if (res.ok && isMounted) {
          const data = await res.json();
          setGreeting(data.greeting);
        }
      } catch (e) {
        console.error("Failed to fetch greeting", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchGreeting();
    return () => { isMounted = false; };
  }, [user]);

  if (loading) {
    // Show a simplified rotation while loading the personalized one
    return (
      <h2 className="text-2xl font-bold text-primary-text">
        <WordRotate words={DEFAULT_GREETINGS} duration={2000} />
      </h2>
    );
  }

  return (
    <h2 className="text-2xl font-bold text-primary-text">
      <AnimatedShinyText shimmerWidth={150} className="inline-flex items-center justify-center">
        <span>{greeting}</span>
      </AnimatedShinyText>
    </h2>
  );
}