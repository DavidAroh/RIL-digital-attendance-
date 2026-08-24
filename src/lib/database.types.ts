export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'employee' | 'manager' | 'admin' | 'student' | 'lecturer';
export type CheckInMethod = 'qr' | 'pin' | 'offline_qr';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          employee_id: string | null;
          matric_number: string | null;
          role: UserRole;
          department: string | null;
          designation: string | null;
          level: string | null;
          notification_token: string | null;
          signature_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          employee_id?: string | null;
          matric_number?: string | null;
          role?: UserRole;
          department?: string | null;
          designation?: string | null;
          level?: string | null;
          notification_token?: string | null;
          signature_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          employee_id?: string | null;
          matric_number?: string | null;
          role?: UserRole;
          department?: string | null;
          designation?: string | null;
          level?: string | null;
          notification_token?: string | null;
          signature_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      courses: {
        Row: {
          id: string;
          code: string;
          title: string;
          department: string;
          level: string; // Shift type / Employment Type
          semester: string; // Location / Work Mode (e.g. HQ Office, Remote)
          lecturer_id: string | null; // Manager / Supervisor ID
          schedule: Json | null; // Per-weekday hours: { days: [{ day, start, end }] }
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          title: string;
          department: string;
          level: string;
          semester: string;
          lecturer_id?: string | null;
          schedule?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          title?: string;
          department?: string;
          level?: string;
          semester?: string;
          lecturer_id?: string | null;
          schedule?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      course_registrations: {
        Row: {
          id: string;
          course_id: string;
          student_id: string; // Employee ID
          registered_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          student_id: string;
          registered_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          student_id?: string;
          registered_at?: string;
        };
      };
      attendance_sessions: {
        Row: {
          id: string;
          course_id: string;
          session_name: string;
          qr_token: string;
          pin_code: string;
          started_at: string;
          expires_at: string;
          ended_at: string | null;
          is_active: boolean;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          course_id: string;
          session_name: string;
          qr_token: string;
          pin_code: string;
          started_at?: string;
          expires_at: string;
          ended_at?: string | null;
          is_active?: boolean;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          course_id?: string;
          session_name?: string;
          qr_token?: string;
          pin_code?: string;
          started_at?: string;
          expires_at?: string;
          ended_at?: string | null;
          is_active?: boolean;
          created_by?: string | null;
        };
      };
      attendance_records: {
        Row: {
          id: string;
          session_id: string;
          student_id: string; // Employee ID
          checked_in_at: string;
          check_in_method: CheckInMethod;
          synced_from_offline: boolean;
          offline_scanned_at: string | null;
        };
        Insert: {
          id?: string;
          session_id: string;
          student_id: string;
          checked_in_at?: string;
          check_in_method: CheckInMethod;
          synced_from_offline?: boolean;
          offline_scanned_at?: string | null;
        };
        Update: {
          id?: string;
          session_id?: string;
          student_id?: string;
          checked_in_at?: string;
          check_in_method?: CheckInMethod;
          synced_from_offline?: boolean;
          offline_scanned_at?: string | null;
        };
      };
      notification_queue: {
        Row: {
          id: string;
          user_id: string | null;
          title: string;
          message: string;
          type: string;
          sent: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          title: string;
          message: string;
          type: string;
          sent?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          title?: string;
          message?: string;
          type?: string;
          sent?: boolean;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: UserRole;
      check_in_method: CheckInMethod;
    };
    CompositeTypes: Record<string, never>;
  };
};
