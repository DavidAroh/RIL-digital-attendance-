import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Building2, TrendingUp, Clock, MapPin, AlertCircle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import type { Database } from '../../lib/database.types';

type Shift = Database['public']['Tables']['courses']['Row'];

interface MyShiftsProps {
  shifts: Shift[];
}

interface ShiftWithStats extends Shift {
  totalSessions: number;
  attendedSessions: number;
  percentage: number;
}

export function MyShifts({ shifts }: MyShiftsProps) {
  const { profile } = useAuth();
  const [shiftsWithStats, setShiftsWithStats] = useState<ShiftWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchShiftStats = useCallback(async () => {
    if (!profile) return;

    setLoading(true);
    setError('');
    try {
      const stats = await Promise.all(
        shifts.map(async (shift) => {
          const { count: totalSessions } = await supabase
            .from('attendance_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('course_id', shift.id)
            .eq('is_active', false);

          const { count: attendedSessions } = await supabase
            .from('attendance_records')
            .select('session_id', { count: 'exact', head: true })
            .eq('student_id', profile.id)
            .in(
              'session_id',
              (
                await supabase
                  .from('attendance_sessions')
                  .select('id')
                  .eq('course_id', shift.id)
              ).data?.map((s) => s.id) || []
            );

          const total = totalSessions || 0;
          const attended = attendedSessions || 0;
          const percentage =
            total > 0 ? Math.round((attended / total) * 100) : 0;

          return {
            ...shift,
            totalSessions: total,
            attendedSessions: attended,
            percentage,
          };
        })
      );

      setShiftsWithStats(stats);
    } catch {
      setError('Failed to compute shift attendance statistics');
    } finally {
      setLoading(false);
    }
  }, [shifts, profile]);

  useEffect(() => {
    fetchShiftStats();
  }, [fetchShiftStats]);

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
        <p className="text-xs text-muted-foreground mt-3">Loading shifts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-xl mx-auto">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (shifts.length === 0) {
    return (
      <Card className="text-center py-12 max-w-lg mx-auto">
        <CardContent className="space-y-3">
          <div className="mx-auto w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
            <Building2 className="w-6 h-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-base">No Shifts Assigned</CardTitle>
          <CardDescription className="text-xs max-w-sm mx-auto">
            You haven't been enrolled in any office shifts or work units yet.
            Contact your HR administrator or manager to get assigned.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            My Assigned Shifts ({shifts.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Overview of your assigned work groups and attendance compliance
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {shiftsWithStats.map((shift) => (
          <Card
            key={shift.id}
            className="flex flex-col justify-between shadow-xs hover:border-foreground/30 transition-colors"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <Badge variant="subtle" className="font-mono text-[10px]">
                    {shift.code}
                  </Badge>
                  <CardTitle className="text-base mt-2">
                    {shift.title}
                  </CardTitle>
                </div>
                <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0 text-foreground">
                  <Building2 className="w-4 h-4" />
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Department:</span>
                <span className="font-medium text-foreground">
                  {shift.department}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center">
                  <Clock className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                  Shift Type:
                </span>
                <span className="font-medium text-foreground">
                  {shift.level || 'Standard Shift'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center">
                  <MapPin className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                  Location:
                </span>
                <span className="font-medium text-foreground">
                  {shift.semester || 'HQ Office'}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-muted-foreground">Attendance:</span>
                <span className="font-mono font-medium text-foreground">
                  {shift.attendedSessions} / {shift.totalSessions} Sessions
                </span>
              </div>
            </CardContent>

            <CardFooter className="pt-3 border-t flex-col items-stretch space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Compliance Rate</span>
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-foreground" />
                  <span className="font-mono font-bold text-foreground">
                    {shift.percentage}%
                  </span>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 rounded-full bg-foreground transition-all duration-500"
                  style={{ width: `${shift.percentage}%` }}
                ></div>
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
