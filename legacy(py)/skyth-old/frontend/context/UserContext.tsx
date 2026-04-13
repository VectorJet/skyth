// context/UserContext.tsx
"use client";

import React, { createContext, useState, useEffect, useContext, ReactNode, useCallback } from 'react';
import { UserProfile, App } from '@/types';
import { useRouter, usePathname } from 'next/navigation';
import { api } from '@/lib/api';

interface UserContextType {
  user: UserProfile | null;
  isLoading: boolean;
  connectedApps: App[];
  register: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateUserProfile: (updates: Partial<UserProfile>) => Promise<{ success: boolean; error?: string }>;
  onboardUser: (name: string) => Promise<{ success: boolean; error?: string }>;
  refetchUser: () => void;
  refetchApps: () => void;
}

const UserContext = createContext<UserContextType | null>(null);

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectedApps, setConnectedApps] = useState<App[]>([]);
  const router = useRouter();
  const pathname = usePathname();

  const fetchConnectedApps = useCallback(async () => {
    try {
      const response = await api('/apps');
      if (response.ok) {
        const allApps: App[] = await response.json();
        setConnectedApps(allApps.filter(app => app.is_connected));
      } else {
        setConnectedApps([]);
      }
    } catch (error) {
      console.error("Failed to fetch connected apps", error);
      setConnectedApps([]);
    }
  }, []);

  const verifyTokenAndFetchUser = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await api('/user/profile'); 
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        await fetchConnectedApps();
      } else {
        localStorage.removeItem('access_token');
        setUser(null);
        setConnectedApps([]);
      }
    } catch (error) {
      console.error("Failed to verify token", error);
      localStorage.removeItem('access_token');
      setUser(null);
      setConnectedApps([]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchConnectedApps]);

  useEffect(() => {
    verifyTokenAndFetchUser();
  }, [verifyTokenAndFetchUser]);

  // NEW: Effect to handle redirection for onboarding
  useEffect(() => {
    // Don't redirect until we've finished checking the user's auth state
    if (isLoading) return;

    const isOnboardingPage = pathname === '/onboarding';

    // If we have a user, they are not onboarded, and they are NOT on the onboarding page...
    if (user && !user.is_onboarded && !isOnboardingPage) {
      // ...force them to the onboarding page.
      router.push('/onboarding');
    }
  }, [user, isLoading, pathname, router]);


  const register = async (username: string, password: string) => {
    try {
      const response = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('access_token', data.access_token);
        setUser(data.user);
        await fetchConnectedApps();
        // The useEffect hook will now handle the redirect to /onboarding
        return { success: true };
      }
      const errorData = await response.json();
      return { success: false, error: errorData.error };
    } catch (error) {
      console.error("Registration failed", error);
      return { success: false, error: 'An unexpected error occurred.' };
    }
  };

  const login = async (username: string, password: string) => {
    try {
      const response = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('access_token', data.access_token);
        setUser(data.user);
        await fetchConnectedApps();
        // The useEffect hook will now handle the redirect to /onboarding
        return { success: true };
      }
      const errorData = await response.json();
      return { success: false, error: errorData.error };
    } catch (error) {
      console.error("Login failed", error);
      return { success: false, error: 'An unexpected error occurred.' };
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    setUser(null);
    setConnectedApps([]);
    router.push('/login');
  };

  const updateUserProfile = async (updates: Partial<UserProfile>) => {
    try {
      const response = await api('/user/profile', {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      if (response.ok) {
        const updatedUser = await response.json();
        setUser(updatedUser);
        return { success: true };
      }
      const errorData = await response.json();
      return { success: false, error: errorData.error };
    } catch (error) {
      console.error("Profile update failed", error);
      return { success: false, error: 'An unexpected error occurred.' };
    }
  };

  // NEW: Function for the onboarding page to call
  const onboardUser = async (name: string) => {
    // The backend uses 'username' for the display name/nickname.
    // We also set is_onboarded to true to complete the flow.
    return await updateUserProfile({ username: name, is_onboarded: true });
  };

  const value = {
    user,
    isLoading,
    connectedApps,
    register,
    login,
    logout,
    updateUserProfile,
    onboardUser,
    refetchUser: verifyTokenAndFetchUser,
    refetchApps: fetchConnectedApps,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};