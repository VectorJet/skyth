// app/register/page.tsx
"use client";

import React, { useState } from 'react';
import { useUser } from '@/context/UserContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/icons';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const { register } = useUser();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters long.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    setIsLoading(true);
    setError(null);
    const result = await register(username, password);
    if (result.success) {
      router.push('/');
    } else {
      setError(result.error || 'An unknown error occurred.');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-bg-color flex items-center justify-center p-4">
      <div className="w-full max-w-sm p-8 bg-surface rounded-2xl shadow-2xl border border-border-color flex flex-col items-center text-center animate-slide-fade-in">
        <div className="w-16 h-16 mb-4">
          <Logo className="w-full h-full fill-primary-text transform rotate-45" />
        </div>
        <h1 className="text-2xl font-bold text-primary-text mb-2">Create your Account</h1>
        <p className="text-secondary-text mb-6">Join Skyth to get started.</p>
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <Input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            className="text-center"
            autoFocus
          />
          <Input
            type="password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            className="text-center"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <Button type="submit" disabled={isLoading || username.trim().length < 3 || password.length < 8}>
            {isLoading ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Register'}
          </Button>
        </form>
        <p className="text-sm text-secondary-text mt-6">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary-text hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}