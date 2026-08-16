import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { encodeSessionData } from '../../utils/qrCode';
import QRCode from 'qrcode';
import {
  Clock,
  Users,
  StopCircle,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import type { Database } from '../../lib/database.types';

type Shift = Database['public']['Tables']['courses']['Row'];
type AttendanceSession =
  Database['public']['Tables']['attendance_sessions']['Row'];
type AttendanceRecord =
  Database['public']['Tables']['attendance_records']['Row'] & {
    profiles?: {
      full_name: string;
      employee_id: string | null;
      matric_number: string | null;
      signature_url: string | null;
    };
  };

interface ActiveSessionViewProps {
  session: AttendanceSession;
  shift: Shift;
  onSessionEnded: () => void;
}

export function ActiveSessionView({
  session,
  shift,
  onSessionEnded,
}: ActiveSessionViewProps) {
  const [attendees, setAttendees] = useState<AttendanceRecord[]>([]);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [query, setQuery] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateQRCode = useCallback(async () => {
    const data = encodeSessionData(
      session.id,
      session.qr_token,
      session.expires_at
    );

    const canvas = canvasRef.current;
    if (canvas) {
      await QRCode.toCanvas(canvas, data, {
        width: 280,
        margin: 2,
        color: {
          dark: '#09090b',
          light: '#ffffff',
        },
      });
    }

    await QRCode.toDataURL(data, { width: 280 });
  }, [session.id, session.qr_token, session.expires_at]);

  const fetchAttendees = useCallback(async () => {
    setIsFetching(true);
    const { data, error } = await supabase.rpc('get_attendees_for_session', {
      p_session_id: session.id,
    });
    if (error) {
      console.error('Error fetching attendees:', error);
      setIsFetching(false);
      return;
    }
    let merged = (data || []).map(
      (row: {
        id: string;
        session_id: string;
        student_id: string;
        checked_in_at: string;
        check_in_method: 'qr' | 'pin' | 'offline_qr';
        synced_from_offline: boolean | null;
        offline_scanned_at: string | null;
        full_name: string | null;
        employee_id: string | null;
        matric_number: string | null;
        signature_url: string | null;
        signature_name: string | null;
      }) => ({
        id: row.id,
        session_id: row.session_id,
        student_id: row.student_id,
        checked_in_at: row.checked_in_at,
        check_in_method: row.check_in_method,
        synced_from_offline: row.synced_from_offline,
        offline_scanned_at: row.offline_scanned_at,
        profiles: {
          full_name: row.full_name || 'Staff Member',
          employee_id: row.employee_id || row.matric_number || null,
          matric_number: row.employee_id || row.matric_number || null,
          signature_url:
            row.signature_url ||
            (row.signature_name
              ? supabase.storage
                  .from('signatures')
                  .getPublicUrl(row.signature_name).data.publicUrl
              : null),
        },
      })
    ) as AttendanceRecord[];

    // Fallback for missing employee IDs
    const missingEmpIds = merged
      .filter((m) => !m.profiles?.employee_id)
      .map((m) => m.student_id);
    if (missingEmpIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, employee_id, matric_number')
        .in('id', missingEmpIds);
      if (profs && Array.isArray(profs)) {
        const empById: Record<string, string | null> = {};
        for (const p of profs as {
          id: string;
          employee_id: string | null;
          matric_number: string | null;
        }[]) {
          empById[p.id] = p.employee_id || p.matric_number || null;
        }
        merged = merged.map((m) => {
          if (!m.profiles?.employee_id) {
            const mm = empById[m.student_id] ?? null;
            return {
              ...m,
              profiles: {
                ...m.profiles!,
                employee_id: mm,
                matric_number: mm,
              },
            };
          }
          return m;
        });
      }
    }

    setAttendees(merged);
    setLastUpdated(new Date().toLocaleTimeString());
    setIsFetching(false);
  }, [session.id]);

  const subscribeToAttendance = useCallback(() => {
    const channel = supabase
      .channel('attendance_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance_records',
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          fetchAttendees();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.id, fetchAttendees]);

  const updateTimeRemaining = useCallback(() => {
    const now = new Date();
    const expires = new Date(session.expires_at);
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) {
      setTimeRemaining('Kiosk Expired');
      return;
    }

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (hours > 0) {
      setTimeRemaining(
        `${hours}h ${minutes}m ${seconds.toString().padStart(2, '0')}s`
      );
    } else {
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }
  }, [session.expires_at]);

  useEffect(() => {
    generateQRCode();
    fetchAttendees();
    const unsubscribe = subscribeToAttendance();
    const interval = setInterval(updateTimeRemaining, 1000);
    const pollInterval = setInterval(fetchAttendees, 5000);
    return () => {
      clearInterval(interval);
      clearInterval(pollInterval);
      unsubscribe();
    };
  }, [
    generateQRCode,
    fetchAttendees,
    subscribeToAttendance,
    updateTimeRemaining,
  ]);

  const handleEndSession = async () => {
    const { error } = await supabase
      .from('attendance_sessions')
      .update({
        is_active: false,
        ended_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    if (error) {
      console.error('Error ending session:', error);
    } else {
      onSessionEnded();
    }
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredAttendees = normalizedQuery
    ? attendees.filter((r) => {
        const name = r.profiles?.full_name?.toLowerCase() || '';
        const method = String(r.check_in_method || '').toLowerCase();
        return (
          name.includes(normalizedQuery) ||
          method.includes(normalizedQuery)
        );
      })
    : attendees;

  return (
    <div className="space-y-6">
      {/* Kiosk Banner */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b">
          <div>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <Badge variant="active" className="font-mono text-[10px]">
                LIVE CHECK-IN KIOSK
              </Badge>
              <Badge variant="subtle" className="font-mono text-[10px]">
                {shift.code}
              </Badge>
            </div>
            <CardTitle className="text-xl mt-2">{session.session_name}</CardTitle>
            <CardDescription className="text-xs">
              {shift.title} &bull; {shift.department}
            </CardDescription>
          </div>

          <Button
            variant="destructive"
            size="sm"
            onClick={handleEndSession}
            className="gap-1.5 text-xs"
          >
            <StopCircle className="w-4 h-4" />
            End Kiosk Session
          </Button>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          {/* Live Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center p-4 border rounded-xl bg-card space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-foreground flex-shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  Time Remaining
                </p>
                <p className="text-xl font-mono font-bold text-foreground">
                  {timeRemaining}
                </p>
              </div>
            </div>

            <div className="flex items-center p-4 border rounded-xl bg-card space-x-3.5">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-foreground flex-shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  Verified Attendees
                </p>
                <p className="text-lg font-bold text-foreground">
                  {attendees.length} Staff
                </p>
              </div>
            </div>
          </div>

          {/* Live Kiosk QR Code Center */}
          <div className="flex flex-col items-center justify-center p-6 bg-muted/20 rounded-xl border text-center max-w-md mx-auto">
            <p className="text-sm font-semibold text-foreground mb-1">
              Scan with Staff App to Check In
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Employees scan this dynamic QR code using their Workforce Hub scanner
            </p>

            <div className="p-3 bg-white rounded-xl shadow-xs border inline-block mb-3">
              <canvas ref={canvasRef} className="mx-auto"></canvas>
            </div>

            <Badge variant="subtle" className="gap-1 text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5" />
              Kiosk verified &bull; Dynamic anti-proxy token
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Live Attendee Roster Table */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4">
          <div>
            <CardTitle className="text-base font-semibold">
              Live Checked-In Staff ({filteredAttendees.length})
            </CardTitle>
            <CardDescription className="text-xs">
              Real-time attendance stream with timestamps and signatures
            </CardDescription>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-60">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search staff name..."
                className="pl-8 h-8 text-xs"
              />
            </div>
            {lastUpdated && (
              <span className="text-[10px] text-muted-foreground hidden sm:inline font-mono">
                {lastUpdated}
              </span>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={fetchAttendees}
              disabled={isFetching}
              className="h-8 w-8"
              title="Refresh Roster"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Signature</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAttendees.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium text-foreground">
                    {record.profiles?.full_name || 'Staff Member'}
                  </TableCell>
                  <TableCell>
                    {record.profiles?.signature_url ? (
                      <img
                        src={record.profiles.signature_url}
                        alt="Signature"
                        className="h-7 w-auto border rounded px-1 bg-background object-contain"
                      />
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        record.check_in_method === 'qr'
                          ? 'active'
                          : record.check_in_method === 'offline_qr'
                          ? 'pending'
                          : 'default'
                      }
                      className="text-[11px]"
                    >
                      {record.check_in_method === 'offline_qr'
                        ? 'Offline QR'
                        : 'QR Code'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {new Date(record.checked_in_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {attendees.length === 0 && (
            <p className="text-center py-8 text-muted-foreground text-xs">
              No staff members have clocked in to this kiosk session yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
