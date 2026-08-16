CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create enum types if not exists or add new values
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('employee', 'manager', 'admin');
EXCEPTION
  WHEN duplicate_object THEN
    -- In case user_role already exists, ensure employee and manager exist
    BEGIN
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'employee';
    EXCEPTION WHEN duplicate_object THEN null; END;
    BEGIN
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'manager';
    EXCEPTION WHEN duplicate_object THEN null; END;
    BEGIN
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';
    EXCEPTION WHEN duplicate_object THEN null; END;
END $$;

DO $$ BEGIN
  CREATE TYPE check_in_method AS ENUM ('qr', 'pin', 'offline_qr');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create or update profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  employee_id text,
  matric_number text, -- legacy alias support
  role user_role NOT NULL DEFAULT 'employee',
  department text,
  designation text,
  level text, -- legacy alias support
  notification_token text,
  signature_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure columns exist if table was already created
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS employee_id text;
EXCEPTION WHEN duplicate_column THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS designation text;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Auto-create/sync profiles from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_emp_id text;
  v_designation text;
BEGIN
  -- Normalize role
  IF NEW.raw_user_meta_data->>'role' = 'lecturer' THEN
    v_role := 'manager';
  ELSIF NEW.raw_user_meta_data->>'role' = 'student' THEN
    v_role := 'employee';
  ELSIF NEW.raw_user_meta_data->>'role' = 'manager' THEN
    v_role := 'manager';
  ELSIF NEW.raw_user_meta_data->>'role' = 'admin' THEN
    v_role := 'admin';
  ELSE
    v_role := 'employee';
  END IF;

  v_emp_id := COALESCE(NEW.raw_user_meta_data->>'employee_id', NEW.raw_user_meta_data->>'matric_number');
  v_designation := COALESCE(NEW.raw_user_meta_data->>'designation', NEW.raw_user_meta_data->>'level');

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    employee_id,
    matric_number,
    role,
    department,
    designation,
    level,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    v_emp_id,
    v_emp_id,
    v_role,
    NEW.raw_user_meta_data->>'department',
    v_designation,
    v_designation,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', public.profiles.full_name),
    employee_id = COALESCE(v_emp_id, public.profiles.employee_id),
    matric_number = COALESCE(v_emp_id, public.profiles.matric_number),
    role = COALESCE(v_role, public.profiles.role),
    department = COALESCE(NEW.raw_user_meta_data->>'department', public.profiles.department),
    designation = COALESCE(v_designation, public.profiles.designation),
    level = COALESCE(v_designation, public.profiles.level),
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email,
      updated_at = now()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

-- Create courses / shifts table (courses table serves as shifts / departments / work units)
CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  title text NOT NULL,
  department text NOT NULL,
  level text NOT NULL, -- Shift Type / Employment Type (e.g. Morning Shift, Full-time)
  semester text NOT NULL, -- Work Location / Mode (e.g. HQ Office, Hybrid, Remote)
  lecturer_id uuid REFERENCES profiles(id) ON DELETE SET NULL, -- Manager / Supervisor ID
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- Relax global uniqueness on code; enforce uniqueness per manager/lecturer
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_code_key;
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_code_lecturer_unique;
DO $$ BEGIN
  ALTER TABLE courses ADD CONSTRAINT courses_code_lecturer_unique UNIQUE (code, lecturer_id);
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- Create course_registrations / shift_assignments table
CREATE TABLE IF NOT EXISTS course_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL, -- Employee ID
  registered_at timestamptz DEFAULT now(),
  UNIQUE(course_id, student_id)
);

ALTER TABLE course_registrations ENABLE ROW LEVEL SECURITY;

-- Create attendance_sessions table
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  session_name text NOT NULL,
  qr_token text UNIQUE NOT NULL,
  pin_code text DEFAULT '',
  started_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;

-- Create attendance_records table
CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES attendance_sessions(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL, -- Employee ID
  checked_in_at timestamptz DEFAULT now(),
  check_in_method check_in_method NOT NULL,
  synced_from_offline boolean DEFAULT false,
  offline_scanned_at timestamptz,
  UNIQUE(session_id, student_id)
);

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- Create notification_queue table
CREATE TABLE IF NOT EXISTS notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL,
  sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

-- Helper functions to check roles securely without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('manager', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_or_admin() TO authenticated;

-- RLS Policies for profiles
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
  CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
  CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
  CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Lecturers can view all profiles" ON profiles;
  DROP POLICY IF EXISTS "Managers and admins can view all profiles" ON profiles;
  CREATE POLICY "Managers and admins can view all profiles"
    ON profiles FOR SELECT
    TO authenticated
    USING (public.is_manager_or_admin());
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- RLS Policies for courses (shifts/departments)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Students can view registered courses" ON courses;
  DROP POLICY IF EXISTS "Employees can view assigned shifts" ON courses;
  CREATE POLICY "Employees can view assigned shifts"
    ON courses FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM course_registrations
        WHERE course_registrations.course_id = courses.id
        AND course_registrations.student_id = auth.uid()
      )
      OR
      public.is_manager_or_admin()
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Lecturers can insert courses" ON courses;
  DROP POLICY IF EXISTS "Managers can insert shifts" ON courses;
  CREATE POLICY "Managers can insert shifts"
    ON courses FOR INSERT
    TO authenticated
    WITH CHECK (public.is_manager_or_admin());
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Lecturers can update own courses" ON courses;
  DROP POLICY IF EXISTS "Managers can update own shifts" ON courses;
  CREATE POLICY "Managers can update own shifts"
    ON courses FOR UPDATE
    TO authenticated
    USING (
      lecturer_id = auth.uid()
      OR
      public.is_admin()
    )
    WITH CHECK (
      lecturer_id = auth.uid()
      OR
      public.is_admin()
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Lecturers can delete own courses" ON courses;
  DROP POLICY IF EXISTS "Managers can delete own shifts" ON courses;
  CREATE POLICY "Managers can delete own shifts"
    ON courses FOR DELETE
    TO authenticated
    USING (
      lecturer_id = auth.uid()
      OR
      public.is_admin()
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- RLS Policies for course_registrations (shift assignments)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Students can view own registrations" ON course_registrations;
  DROP POLICY IF EXISTS "Employees can view own shift assignments" ON course_registrations;
  CREATE POLICY "Employees can view own shift assignments"
    ON course_registrations FOR SELECT
    TO authenticated
    USING (
      student_id = auth.uid()
      OR
      public.is_manager_or_admin()
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Students can register for courses" ON course_registrations;
  DROP POLICY IF EXISTS "Employees can enroll in shifts" ON course_registrations;
  CREATE POLICY "Employees can enroll in shifts"
    ON course_registrations FOR INSERT
    TO authenticated
    WITH CHECK (student_id = auth.uid() OR public.is_manager_or_admin());
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Students can unregister from courses" ON course_registrations;
  DROP POLICY IF EXISTS "Employees can leave shifts" ON course_registrations;
  CREATE POLICY "Employees can leave shifts"
    ON course_registrations FOR DELETE
    TO authenticated
    USING (student_id = auth.uid() OR public.is_manager_or_admin());
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- RLS Policies for attendance_sessions
DO $$ BEGIN
  DROP POLICY IF EXISTS "Students can view active sessions for registered courses" ON attendance_sessions;
  DROP POLICY IF EXISTS "Employees can view active sessions for assigned shifts" ON attendance_sessions;
  CREATE POLICY "Employees can view active sessions for assigned shifts"
    ON attendance_sessions FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM course_registrations
        WHERE course_registrations.course_id = attendance_sessions.course_id
        AND course_registrations.student_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM courses
        WHERE courses.id = attendance_sessions.course_id
        AND courses.lecturer_id = auth.uid()
      )
      OR
      public.is_manager_or_admin()
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Lecturers can create sessions for own courses" ON attendance_sessions;
  DROP POLICY IF EXISTS "Managers can create sessions for own shifts" ON attendance_sessions;
  CREATE POLICY "Managers can create sessions for own shifts"
    ON attendance_sessions FOR INSERT
    TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM courses
        WHERE courses.id = course_id
        AND courses.lecturer_id = auth.uid()
      )
      OR
      public.is_admin()
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Lecturers can update own sessions" ON attendance_sessions;
  DROP POLICY IF EXISTS "Managers can update own sessions" ON attendance_sessions;
  CREATE POLICY "Managers can update own sessions"
    ON attendance_sessions FOR UPDATE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM courses
        WHERE courses.id = attendance_sessions.course_id
        AND courses.lecturer_id = auth.uid()
      )
      OR
      public.is_admin()
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM courses
        WHERE courses.id = attendance_sessions.course_id
        AND courses.lecturer_id = auth.uid()
      )
      OR
      public.is_admin()
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- RLS Policies for attendance_records
DO $$ BEGIN
  DROP POLICY IF EXISTS "Students can view own attendance records" ON attendance_records;
  DROP POLICY IF EXISTS "Employees can view own attendance records" ON attendance_records;
  CREATE POLICY "Employees can view own attendance records"
    ON attendance_records FOR SELECT
    TO authenticated
    USING (
      student_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM attendance_sessions
        JOIN courses ON courses.id = attendance_sessions.course_id
        WHERE attendance_sessions.id = attendance_records.session_id
        AND courses.lecturer_id = auth.uid()
      )
      OR
      public.is_manager_or_admin()
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Students can insert own attendance records" ON attendance_records;
  DROP POLICY IF EXISTS "Employees can insert own attendance records" ON attendance_records;
  CREATE POLICY "Employees can insert own attendance records"
    ON attendance_records FOR INSERT
    TO authenticated
    WITH CHECK (student_id = auth.uid());
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- RLS Policies for notification_queue
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own notifications" ON notification_queue;
  CREATE POLICY "Users can view own notifications"
    ON notification_queue FOR SELECT
    TO authenticated
    USING (
      user_id = auth.uid()
      OR
      public.is_manager_or_admin()
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "System can insert notifications" ON notification_queue;
  CREATE POLICY "System can insert notifications"
    ON notification_queue FOR INSERT
    TO authenticated
    WITH CHECK (true);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "System can update notifications" ON notification_queue;
  CREATE POLICY "System can update notifications"
    ON notification_queue FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_employee_id ON profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_profiles_signature ON profiles(signature_url);
CREATE INDEX IF NOT EXISTS idx_courses_lecturer ON courses(lecturer_id);
CREATE INDEX IF NOT EXISTS idx_course_registrations_student ON course_registrations(student_id);
CREATE INDEX IF NOT EXISTS idx_course_registrations_course ON course_registrations(course_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_course ON attendance_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_active ON attendance_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_user ON notification_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_sent ON notification_queue(sent);

-- Pin check-in RPC function (server-side, RLS-safe)
DROP FUNCTION IF EXISTS public.pin_checkin(text);
CREATE OR REPLACE FUNCTION public.pin_checkin(p_pin_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_session attendance_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM attendance_sessions
  WHERE pin_code = p_pin_code
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_pin');
  END IF;

  IF v_session.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  BEGIN
    INSERT INTO attendance_records (session_id, student_id, check_in_method)
    VALUES (v_session.id, auth.uid(), 'pin');
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'duplicate');
  END;

  RETURN jsonb_build_object('ok', true);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.pin_checkin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pin_checkin(text) TO anon;

-- QR check-in RPC function (server-side, RLS-safe)
DROP FUNCTION IF EXISTS public.qr_checkin(uuid, text);
CREATE OR REPLACE FUNCTION public.qr_checkin(p_session_id uuid, p_qr_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_session attendance_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM attendance_sessions
  WHERE id = p_session_id
    AND qr_token = p_qr_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid');
  END IF;

  IF v_session.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  BEGIN
    INSERT INTO attendance_records (session_id, student_id, check_in_method)
    VALUES (v_session.id, auth.uid(), 'qr');
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'duplicate');
  END;

  RETURN jsonb_build_object('ok', true);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.qr_checkin(uuid, text) TO authenticated;

-- Employee attendance history RPC (server-side, RLS-safe)
DROP FUNCTION IF EXISTS public.get_attendance_history_for_current_user();
CREATE OR REPLACE FUNCTION public.get_attendance_history_for_current_user()
RETURNS TABLE (
  checked_in_at timestamptz,
  check_in_method check_in_method,
  synced_from_offline boolean,
  offline_scanned_at timestamptz,
  session_name text,
  started_at timestamptz,
  course_code text,
  course_title text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT r.checked_in_at,
         r.check_in_method,
         r.synced_from_offline,
         r.offline_scanned_at,
         s.session_name,
         s.started_at,
         c.code,
         c.title
  FROM attendance_records r
  JOIN attendance_sessions s ON s.id = r.session_id
  JOIN courses c ON c.id = s.course_id
  WHERE r.student_id = auth.uid()
  ORDER BY r.checked_in_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_attendance_history_for_current_user() TO authenticated;

-- Storage: signatures bucket and policies
DO $$ BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('signatures', 'signatures', true);
EXCEPTION WHEN unique_violation THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Public read signatures" ON storage.objects;
  CREATE POLICY "Public read signatures"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'signatures');
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Secure RPC to fetch attendees with profile data for a session (manager or admin)
DROP FUNCTION IF EXISTS public.get_attendees_for_session(uuid);
CREATE OR REPLACE FUNCTION public.get_attendees_for_session(p_session_id uuid)
RETURNS TABLE (
  id uuid,
  session_id uuid,
  student_id uuid,
  checked_in_at timestamptz,
  check_in_method check_in_method,
  synced_from_offline boolean,
  offline_scanned_at timestamptz,
  full_name text,
  employee_id text,
  matric_number text,
  signature_url text,
  signature_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM attendance_sessions s
    JOIN courses c ON c.id = s.course_id
    WHERE s.id = p_session_id
      AND (c.lecturer_id = auth.uid() OR public.is_manager_or_admin())
  ) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  RETURN QUERY
  SELECT r.id,
         r.session_id,
         r.student_id,
         r.checked_in_at,
         r.check_in_method,
         r.synced_from_offline,
         r.offline_scanned_at,
         p.full_name,
         COALESCE(p.employee_id, p.matric_number, u.raw_user_meta_data->>'employee_id', u.raw_user_meta_data->>'matric_number') AS employee_id,
         COALESCE(p.employee_id, p.matric_number, u.raw_user_meta_data->>'employee_id', u.raw_user_meta_data->>'matric_number') AS matric_number,
         p.signature_url,
         (
           SELECT so.name
           FROM storage.objects so
           WHERE so.bucket_id = 'signatures' AND so.owner = r.student_id
           ORDER BY so.created_at DESC
           LIMIT 1
         ) AS signature_name
  FROM attendance_records r
  LEFT JOIN profiles p ON p.id = r.student_id
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE r.session_id = p_session_id
  ORDER BY r.checked_in_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_attendees_for_session(uuid) TO authenticated;

-- Storage policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Auth insert signatures" ON storage.objects;
  CREATE POLICY "Auth insert signatures"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'signatures');
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Owner update signatures" ON storage.objects;
  CREATE POLICY "Owner update signatures"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'signatures' AND owner = auth.uid())
    WITH CHECK (bucket_id = 'signatures' AND owner = auth.uid());
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Owner delete signatures" ON storage.objects;
  CREATE POLICY "Owner delete signatures"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'signatures' AND owner = auth.uid());
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Role management function
DROP FUNCTION IF EXISTS public.set_user_role(uuid, user_role);
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role user_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  UPDATE profiles
  SET role = p_role,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, user_role) TO authenticated;
