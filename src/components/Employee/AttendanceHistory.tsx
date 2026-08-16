import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Building2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import type { Database } from '../../lib/database.types';

type HistoryRow = {
  checked_in_at: string;
  check_in_method: Database['public']['Tables']['attendance_records']['Row']['check_in_method'];
  synced_from_offline: boolean | null;
  offline_scanned_at: string | null;
  session_name: string;
  started_at: string;
  course_code: string;
  course_title: string;
};

export function AttendanceHistory() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAttendanceHistory = useCallback(async () => {
    if (!profile) return;

    setLoading(true);
    setError('');
    const { data, error } = await supabase.rpc(
      'get_attendance_history_for_current_user'
    );
    if (error) {
      setError('Failed to load attendance history');
    } else {
      setRecords((data || []) as HistoryRow[]);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchAttendanceHistory();
  }, [fetchAttendanceHistory]);

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
        <p className="text-xs text-muted-foreground mt-3">
          Loading attendance logs...
        </p>
      </div>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-lg">Attendance Logs & History</CardTitle>
          <CardDescription className="text-xs">
            Track all your verified clock-in sessions and work records
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={fetchAttendanceHistory}
          className="h-8 w-8"
          title="Refresh History"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>

      <CardContent>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : records.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-xl bg-muted/20">
            <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-foreground">
              No attendance records yet
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Your verified clock-ins will appear here once you check in
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => (
              <div
                key={`${record.checked_in_at}-${record.session_name}`}
                className="border rounded-lg p-4 hover:border-foreground/30 transition-colors bg-card"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start space-x-3">
                    <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0 mt-0.5 text-foreground">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-semibold text-foreground text-sm">
                          {record.session_name}
                        </h3>
                        <Badge variant="subtle" className="font-mono text-[10px]">
                          {record.course_code}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center">
                        <Building2 className="w-3.5 h-3.5 mr-1" />
                        {record.course_title}
                      </p>
                      <div className="flex items-center text-xs text-muted-foreground mt-1.5 space-x-3">
                        <span className="flex items-center">
                          <Calendar className="w-3.5 h-3.5 mr-1" />
                          {new Date(record.checked_in_at).toLocaleDateString(
                            undefined,
                            {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            }
                          )}
                        </span>
                        <span className="flex items-center">
                          <Clock className="w-3.5 h-3.5 mr-1" />
                          {new Date(record.checked_in_at).toLocaleTimeString(
                            [],
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            }
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center sm:flex-col sm:items-end justify-between gap-1 border-t sm:border-t-0 pt-2 sm:pt-0">
                    <Badge
                      variant={
                        record.check_in_method === 'qr'
                          ? 'active'
                          : record.check_in_method === 'offline_qr'
                          ? 'pending'
                          : 'default'
                      }
                      className="text-xs font-normal"
                    >
                      {record.check_in_method === 'qr'
                        ? 'Live QR Scan'
                        : record.check_in_method === 'offline_qr'
                        ? 'Offline QR Scan'
                        : 'PIN Code Check-In'}
                    </Badge>
                    {record.synced_from_offline && (
                      <span className="text-[11px] text-muted-foreground font-medium">
                        Synced from offline cache
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
