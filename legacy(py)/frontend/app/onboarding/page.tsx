// app/onboarding/page.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { useUser } from '@/context/UserContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/icons';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
  const { user, onboardUser } = useUser();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // If an already-onboarded user somehow lands here, redirect them away.
  useEffect(() => {
    if (user?.is_onboarded) {
      router.push('/');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 3) {
      setError('Name must be at least 3 characters long.');
      return;
    }
    setIsLoading(true);
    setError(null);
    const result = await onboardUser(name);
    if (result.success) {
      // On success, redirect to the main chat page
      router.push('/');
    } else {
      setError(result.error || 'An unknown error occurred.');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-bg-color flex items-center justify-center">
      <div className="w-full max-w-sm p-8 bg-surface rounded-2xl shadow-2xl border border-border-color flex flex-col items-center text-center animate-slide-fade-in">
        <div className="w-16 h-16 mb-4">
          <Logo className="w-full h-full fill-primary-text transform rotate-45" />
        </div>
        <h1 className="text-2xl font-bold text-primary-text mb-2">Welcome to Skyth</h1>
        <p className="text-secondary-text mb-6">What should I call you?</p>
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <Input
            type="text"
            placeholder="Enter your name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isLoading}
            className="text-center"
            autoFocus
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <Button type="submit" disabled={isLoading || name.trim().length < 3}>
            {isLoading ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Continue'}
          </Button>
        </form>
      </div>
    </div>
  );
}