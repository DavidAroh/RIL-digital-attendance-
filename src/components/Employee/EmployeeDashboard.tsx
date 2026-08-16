import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Building2, LogOut, QrCode, History, Briefcase } from 'lucide-react';
import { MyShifts } from './MyShifts';
import { AttendanceScanner } from './AttendanceScanner';
import { AttendanceHistory } from './AttendanceHistory';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import type { Database } from '../../lib/database.types';

type Shift = Database['public']['Tables']['courses']['Row'];

export function EmployeeDashboard() {
  const { profile, signOut } = useAuth();
  const [view, setView] = useState<'scanner' | 'shifts' | 'history'>('scanner');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchShifts = useCallback(async () => {
    if (!profile) return;

    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('course_registrations')
      .select('courses(*)')
      .eq('student_id', profile.id);

    if (error) {
      setError('Failed to load assigned shifts');
    } else {
      type RegRow = { courses: Shift };
      const rows = data as unknown as RegRow[] | null;
      setShifts(rows?.map((reg) => reg.courses).filter(Boolean) || []);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const initials = (profile?.full_name || 'Staff')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Top Corporate Navigation Header */}
      <header className="bg-background border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Avatar className="h-9 w-9 rounded-lg">
                <AvatarFallback className="rounded-lg bg-primary text-primary-foreground font-semibold text-xs">
                  {initials || <Building2 className="w-4 h-4" />}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-sm font-semibold text-foreground leading-none">
                    Workforce Hub
                  </h1>
                  <Badge variant="subtle" className="text-[10px]">
                    Employee
                  </Badge>
                </div>
                <div className="flex items-center space-x-2 text-xs text-muted-foreground mt-1">
                  <span className="font-medium text-foreground">{profile?.full_name}</span>
                  {profile?.department && (
                    <>
                      <span>&bull;</span>
                      <span>{profile.department}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Badge variant="outline" className="hidden sm:inline-flex text-xs font-normal">
                {profile?.designation || profile?.level || 'Full-Time Staff'}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="h-8 gap-1.5 text-xs"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-background border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <Tabs
            value={view}
            onValueChange={(val) => setView(val as 'scanner' | 'shifts' | 'history')}
          >
            <TabsList className="bg-muted/60">
              <TabsTrigger value="scanner" className="gap-2 text-xs">
                <QrCode className="w-3.5 h-3.5" />
                Clock In / Check In
              </TabsTrigger>
              <TabsTrigger value="shifts" className="gap-2 text-xs">
                <Briefcase className="w-3.5 h-3.5" />
                My Shifts
                {shifts.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-background border font-mono">
                    {shifts.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2 text-xs">
                <History className="w-3.5 h-3.5" />
                Attendance Logs
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main Content View */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading && view === 'shifts' ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
          </div>
        ) : error && view === 'shifts' ? (
          <div className="text-center py-12">
            <p className="text-destructive text-sm font-medium">{error}</p>
          </div>
        ) : (
          <>
            {view === 'scanner' && <AttendanceScanner />}
            {view === 'shifts' && <MyShifts shifts={shifts} />}
            {view === 'history' && <AttendanceHistory />}
          </>
        )}
      </main>
    </div>
  );
}
