import { createContext, useContext } from 'react';
import type { Database, UserRole } from '../lib/database.types';
import type { User, Session } from '@supabase/supabase-js';

export type Profile = Database['public']['Tables']['profiles']['Row'];

export interface SignUpUserData {
  full_name: string;
  role: 'employee' | 'manager' | 'admin';
  employee_id?: string;
  matric_number?: string; // legacy alias
  department?: string;
  designation?: string;
  level?: string; // legacy alias
}

export interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, userData: SignUpUserData, signatureFile?: File | null) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  requestForgotPassword: (email: string) => Promise<void>;
  completePasswordReset: (newPassword: string) => Promise<void>;
  passwordRecovery: boolean;
  ensureRecoverySession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
export type { UserRole };
