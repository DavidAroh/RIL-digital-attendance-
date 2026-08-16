import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Users,
  Building2,
  Calendar,
  Briefcase,
  CheckCircle2,
  Clock as ClockIcon,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';

interface Stats {
  totalEmployees: number;
  totalManagers: number;
  totalShifts: number;
  totalSessions: number;
  todaySessions: number;
  totalAttendance: number;
}

export function Analytics() {
  const [stats, setStats] = useState<Stats>({
    totalEmployees: 0,
    totalManagers: 0,
    totalShifts: 0,
    totalSessions: 0,
    todaySessions: 0,
    totalAttendance: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);

    const [
      employeesResult,
      legacyStudentsResult,
      managersResult,
      legacyLecturersResult,
      shiftsResult,
      sessionsResult,
      todaySessionsResult,
      attendanceResult,
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'employee'),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'student' as unknown as 'employee'),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'manager'),
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'lecturer' as unknown as 'manager'),
      supabase.from('courses').select('*', { count: 'exact', head: true }),
      supabase
        .from('attendance_sessions')
        .select('*', { count: 'exact', head: true }),
      supabase
        .from('attendance_sessions')
        .select('*', { count: 'exact', head: true })
        .gte('started_at', new Date().toISOString().split('T')[0]),
      supabase
        .from('attendance_records')
        .select('*', { count: 'exact', head: true }),
    ]);

    const totalEmployees =
      (employeesResult.count || 0) + (legacyStudentsResult.count || 0);
    const totalManagers =
      (managersResult.count || 0) + (legacyLecturersResult.count || 0);

    setStats({
      totalEmployees,
      totalManagers,
      totalShifts: shiftsResult.count || 0,
      totalSessions: sessionsResult.count || 0,
      todaySessions: todaySessionsResult.count || 0,
      totalAttendance: attendanceResult.count || 0,
    });

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
        <p className="text-xs text-muted-foreground mt-3">
          Computing workplace metrics...
        </p>
      </div>
    );
  }

  const totalStaff = stats.totalEmployees + stats.totalManagers;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Workplace Analytics & Insights
        </h2>
        <p className="text-xs text-muted-foreground">
          High-level overview of company attendance, compliance, and kiosk sessions
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Total Employees
              </p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {stats.totalEmployees}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Active staff
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-foreground">
              <Users className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Managers & Leads
              </p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {stats.totalManagers}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Department supervisors
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-foreground">
              <Briefcase className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Shifts & Work Units
              </p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {stats.totalShifts}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Configured departments
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-foreground">
              <Building2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Total Kiosks Launched
              </p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {stats.totalSessions}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                All-time check-in sessions
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-foreground">
              <Calendar className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Today's Kiosk Sessions
              </p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {stats.todaySessions}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Active today
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-foreground">
              <ClockIcon className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Verified Clock-Ins
              </p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {stats.totalAttendance}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Total recorded logs
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-foreground">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">
            Workforce Breakdown & Attendance Metrics
          </CardTitle>
          <CardDescription className="text-xs">
            Distribution across roles and session participation
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground font-medium">
              <span className="text-foreground">Employee Share</span>
              <span>
                {stats.totalEmployees} / {totalStaff || 1} staff (
                {totalStaff
                  ? Math.round((stats.totalEmployees / totalStaff) * 100)
                  : 0}
                %)
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-foreground h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${
                    totalStaff
                      ? Math.min((stats.totalEmployees / totalStaff) * 100, 100)
                      : 0
                  }%`,
                }}
              ></div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground font-medium">
              <span className="text-foreground">Management & Supervisors</span>
              <span>
                {stats.totalManagers} / {totalStaff || 1} staff (
                {totalStaff
                  ? Math.round((stats.totalManagers / totalStaff) * 100)
                  : 0}
                %)
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-muted-foreground h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${
                    totalStaff
                      ? Math.min((stats.totalManagers / totalStaff) * 100, 100)
                      : 0
                  }%`,
                }}
              ></div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground font-medium">
              <span className="text-foreground">
                Average Attendance per Kiosk Session
              </span>
              <span>
                {stats.totalSessions > 0
                  ? Math.round(stats.totalAttendance / stats.totalSessions)
                  : 0}{' '}
                employees / session
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-foreground h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    (stats.totalAttendance /
                      (stats.totalSessions * (stats.totalEmployees || 1) || 1)) *
                      100,
                    100
                  )}%`,
                }}
              ></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
