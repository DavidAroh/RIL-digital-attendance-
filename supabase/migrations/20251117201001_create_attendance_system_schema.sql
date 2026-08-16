CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create enum types
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('student', 'lecturer', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE check_in_method AS ENUM ('qr', 'pin', 'offline_qr');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  matric_number text,
  role user_role NOT NULL DEFAULT 'student',
  department text,
  level text,
  notification_token text,
  signature_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Auto-create/sync profiles from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    department,
    level,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'student'),
    NULL,
    NULL,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', public.profiles.full_name),
    role = public.profiles.role,
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

-- Create courses table
CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  title text NOT NULL,
  department text NOT NULL,
  level text NOT NULL,
  semester text NOT NULL,
  lecturer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- Relax global uniqueness on code; enforce uniqueness per lecturer
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_code_key;
DO $$ BEGIN
  ALTER TABLE courses ADD CONSTRAINT courses_code_lecturer_unique UNIQUE (code, lecturer_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create course_registrations table
CREATE TABLE IF NOT EXISTS course_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
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
  pin_code text NOT NULL,
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
  student_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
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

-- RLS Policies for profiles
DO $$ BEGIN
  CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

  DO $$ BEGIN
    CREATE POLICY "Lecturers can view all profiles"
      ON profiles FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM auth.users
          WHERE auth.users.id = auth.uid()
          AND (auth.users.raw_user_meta_data->>'role')::user_role IN ('lecturer', 'admin')
        )
      );
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;

-- RLS Policies for courses
DO $$ BEGIN
  CREATE POLICY "Students can view registered courses"
    ON courses FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM course_registrations
        WHERE course_registrations.course_id = courses.id
        AND course_registrations.student_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('lecturer', 'admin')
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Lecturers can insert courses"
    ON courses FOR INSERT
    TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('lecturer', 'admin')
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Lecturers can update own courses"
    ON courses FOR UPDATE
    TO authenticated
    USING (
      lecturer_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
      )
    )
    WITH CHECK (
      lecturer_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Lecturers can delete own courses"
    ON courses FOR DELETE
    TO authenticated
    USING (
      lecturer_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for course_registrations
DO $$ BEGIN
  CREATE POLICY "Students can view own registrations"
    ON course_registrations FOR SELECT
    TO authenticated
    USING (
      student_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('lecturer', 'admin')
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Students can register for courses"
    ON course_registrations FOR INSERT
    TO authenticated
    WITH CHECK (student_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Students can unregister from courses"
    ON course_registrations FOR DELETE
    TO authenticated
    USING (student_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for attendance_sessions
DO $$ BEGIN
  CREATE POLICY "Students can view active sessions for registered courses"
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
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Lecturers can create sessions for own courses"
    ON attendance_sessions FOR INSERT
    TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM courses
        WHERE courses.id = course_id
        AND courses.lecturer_id = auth.uid()
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Lecturers can update own sessions"
    ON attendance_sessions FOR UPDATE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM courses
        WHERE courses.id = attendance_sessions.course_id
        AND courses.lecturer_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM courses
        WHERE courses.id = attendance_sessions.course_id
        AND courses.lecturer_id = auth.uid()
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for attendance_records
DO $$ BEGIN
  CREATE POLICY "Students can view own attendance records"
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
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Students can insert own attendance records"
    ON attendance_records FOR INSERT
    TO authenticated
    WITH CHECK (student_id = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- RLS Policies for notification_queue
DO $$ BEGIN
  CREATE POLICY "Users can view own notifications"
    ON notification_queue FOR SELECT
    TO authenticated
    USING (
      user_id = auth.uid()
      OR
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('lecturer', 'admin')
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "System can insert notifications"
    ON notification_queue FOR INSERT
    TO authenticated
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "System can update notifications"
    ON notification_queue FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_matric ON profiles(matric_number);
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

-- Student attendance history RPC (server-side, RLS-safe)
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
  CREATE POLICY "Public read signatures"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'signatures');
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;

-- Secure RPC to fetch attendees with profile data for a session (lecturer-only)
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
      AND (c.lecturer_id = auth.uid()
           OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
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
         COALESCE(p.matric_number, u.raw_user_meta_data->>'matric_number') AS matric_number,
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

DO $$ BEGIN
  CREATE POLICY "Auth insert signatures"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'signatures');
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Owner update signatures"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'signatures' AND owner = auth.uid())
    WITH CHECK (bucket_id = 'signatures' AND owner = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Owner delete signatures"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'signatures' AND owner = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Owner delete signatures"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'signatures' AND owner = auth.uid());
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Admins can insert profiles"
    ON profiles FOR INSERT
    TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Prevent non-admin role changes
DROP TRIGGER IF EXISTS trg_profiles_prevent_role_change ON profiles;
DROP FUNCTION IF EXISTS public.profiles_prevent_role_change();
CREATE OR REPLACE FUNCTION public.profiles_prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    ) THEN
      RAISE EXCEPTION 'role_change_not_allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_prevent_role_change
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_prevent_role_change();
DO $$ BEGIN
  CREATE POLICY "Admins can update profiles"
    ON profiles FOR UPDATE
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'admin'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role = 'admin'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
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