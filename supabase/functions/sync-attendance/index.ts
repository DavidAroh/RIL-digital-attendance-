import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface SyncRequest {
  session_id: string;
  employee_id?: string;
  student_id?: string;
  scanned_at_offline: string;
  qr_token: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: SyncRequest = await req.json();
    const { session_id, scanned_at_offline, qr_token } = body;
    const userId = body.employee_id || body.student_id;

    if (!session_id || !userId || !scanned_at_offline || !qr_token) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: session, error: sessionError } = await supabase
      .from('attendance_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('qr_token', qr_token)
      .maybeSingle();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: 'Invalid session or QR token' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data, error } = await supabase
      .from('attendance_records')
      .insert({
        session_id,
        student_id: userId,
        check_in_method: 'offline_qr',
        synced_from_offline: true,
        offline_scanned_at: scanned_at_offline,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return new Response(
          JSON.stringify({ error: 'Already checked in' }),
          {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      throw error;
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error syncing attendance:', error);
    return new Response(
      JSON.stringify({ error: (error as Error)?.message || 'Server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});