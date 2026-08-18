import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Plus, LogOut, Briefcase, Calendar, LayoutGrid } from 'lucide-react';
import { ShiftList } from './ShiftList';
import { CreateShiftModal } from './CreateShiftModal';
import { SessionManager } from './SessionManager';
import { AttendanceCalendar } from '../Calendar/AttendanceCalendar';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import type { Database } from '../../lib/database.types';

type Shift = Database['public']['Tables']['courses']['Row'];

export function ManagerDashboard() {
  const { profile, signOut } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'shifts' | 'calendar'>('shifts');

  const fetchShifts = useCallback(async () => {
    if (!profile) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .eq('lecturer_id', profile.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching shifts:', error);
    } else {
      setShifts(data || []);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  const handleShiftCreated = () => {
    fetchShifts();
    setShowCreateModal(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (selectedShift) {
    return (
      <SessionManager
        shift={selectedShift}
        onBack={() => setSelectedShift(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Top Header */}
      <header className="bg-background border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Avatar className="h-9 w-9 rounded-lg">
                <AvatarFallback className="rounded-lg bg-primary text-primary-foreground font-semibold">
                  <Briefcase className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-sm font-semibold text-foreground leading-none">
                    Manager Portal
                  </h1>
                  <Badge variant="subtle" className="text-[10px]">
                    Team Lead
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

            <div className="flex items-center space-x-2.5">
              <Button
                size="sm"
                onClick={() => setShowCreateModal(true)}
                className="hidden sm:inline-flex h-8 gap-1.5 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Shift / Group
              </Button>
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

      {/* Tabs Navigation */}
      <div className="bg-background border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <Tabs
            value={view}
            onValueChange={(val) => setView(val as 'shifts' | 'calendar')}
          >
            <TabsList className="bg-muted/60">
              <TabsTrigger value="shifts" className="gap-2 text-xs">
                <LayoutGrid className="w-3.5 h-3.5" />
                Managed Shifts & Kiosks
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-2 text-xs">
                <Calendar className="w-3.5 h-3.5" />
                Staff Attendance Calendar
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {view === 'shifts' ? (
          <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  Managed Shifts & Work Groups ({shifts.length})
                </h2>
                <p className="text-xs text-muted-foreground">
                  Select a shift to launch a live check-in kiosk or view attendance records
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setShowCreateModal(true)}
                className="sm:hidden h-8 gap-1.5 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Shift / Group
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-16">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
              </div>
            ) : (
              <ShiftList shifts={shifts} onSelectShift={setSelectedShift} />
            )}
          </>
        ) : (
          <AttendanceCalendar managerId={profile?.id} />
        )}
      </main>

      {showCreateModal && (
        <CreateShiftModal
          onClose={() => setShowCreateModal(false)}
          onShiftCreated={handleShiftCreated}
        />
      )}
    </div>
  );
}
