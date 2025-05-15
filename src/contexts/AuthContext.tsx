"use client";

import type { User } from '@/lib/types';
import { mockUser, mockTrackUser } from '@/lib/mock-data'; // Import both mock users
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to get user from localStorage safely
const getUserFromStorage = (): User | null => {
  if (typeof window === 'undefined') {
    return null; // Cannot access localStorage on server
  }
  try {
    const storedUser = localStorage.getItem('trackpulseUser');
    return storedUser ? JSON.parse(storedUser) : null;
  } catch (error) {
    console.error("Error reading user from localStorage:", error);
    localStorage.removeItem('trackpulseUser'); // Clear corrupted data
    return null;
  }
};


export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start true until storage is checked
  const router = useRouter();
  const pathname = usePathname();

  // Effect to load user from storage on initial client load
  useEffect(() => {
    const loadedUser = getUserFromStorage();
    if (loadedUser) {
      setUser(loadedUser);
    }
    setIsLoading(false); // Finished loading initial auth state
  }, []);

  // Effect for handling redirection logic AFTER loading is complete
  useEffect(() => {
    if (isLoading) return; // Wait until initial auth state is resolved

    const isAuthPage = pathname === '/login';

    if (!user && !isAuthPage) {
      // If not logged in and not on login page, redirect to login
      router.replace('/login');
    } else if (user && isAuthPage) {
      // If logged in and somehow on login page, redirect to dashboard
      router.replace('/dashboard');
    }
    // No redirect needed otherwise
  }, [user, isLoading, pathname, router]);


  const login = async (email: string, password?: string) => {
    setIsLoading(true); // Indicate login process started
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500)); // Reduced delay

      let loggedInUser: User | null = null;

      // Simple mock auth: check email domain and specific emails for roles
      if (email.endsWith('@trackpulse.com')) {
         if (email === mockUser.email) {
            loggedInUser = mockUser;
         } else if (email === mockTrackUser.email) {
            loggedInUser = mockTrackUser;
         } else {
           // Maybe allow any @trackpulse.com email with a default role?
           // For now, only allow the two specific mock users.
           throw new Error('User not recognized');
         }
      } else {
         throw new Error('Invalid email domain');
      }

      if (loggedInUser) {
        setUser(loggedInUser);
        localStorage.setItem('trackpulseUser', JSON.stringify(loggedInUser));
        // Redirect will be handled by the useEffect listening to `user` changes
      } else {
        // Should not happen with current logic, but good practice
        throw new Error('Login failed');
      }
    } catch (error) {
        console.error("Login failed:", error);
        // Re-throw the error so the form can display it
        throw error;
    } finally {
        // Set loading false regardless of success or failure
        // The redirect effect runs AFTER this state update
        setIsLoading(false);
    }
  };


  const logout = () => {
    setUser(null);
    localStorage.removeItem('trackpulseUser');
    // Redirect will be handled by the useEffect listening to `user` changes
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
