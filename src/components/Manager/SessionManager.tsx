import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Plus, Building2 } from 'lucide-react';
import { CreateSessionModal } from './CreateSessionModal';
import { ActiveSessionView } from './ActiveSessionView';
import { SessionHistory } from './SessionHistory';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '../ui/card';
import type { Database } from '../../lib/database.types';

type Shift = Database['public']['Tables']['courses']['Row'];
type AttendanceSession =
  Database['public']['Tables']['attendance_sessions']['Row'];

interface SessionManagerProps {
  shift: Shift;
  onBack: () => void;
}

export function SessionManager({ shift, onBack }: SessionManagerProps) {
  const [activeSession, setActiveSession] =
    useState<AttendanceSession | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchActiveSession = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('attendance_sessions')
      .select('*')
      .eq('course_id', shift.id)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('Error fetching active session:', error);
    } else {
      setActiveSession(data);
    }
    setLoading(false);
  }, [shift.id]);

  useEffect(() => {
    fetchActiveSession();
  }, [fetchActiveSession]);

  const handleSessionCreated = () => {
    fetchActiveSession();
    setShowCreateModal(false);
  };

  const handleSessionEnded = () => {
    setActiveSession(null);
  };

  return (
    <div className="min-h-screen bg-muted/20 pb-12">
      <header className="bg-background border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-7 px-2 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Shifts & Work Groups
          </Button>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-foreground flex-shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <Badge variant="subtle" className="font-mono text-[10px]">
                  {shift.code}
                </Badge>
                <h1 className="text-lg font-bold text-foreground">
                  {shift.title}
                </h1>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {shift.department} &bull; {shift.level} &bull; {shift.semester}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
          </div>
        ) : activeSession ? (
          <ActiveSessionView
            session={activeSession}
            shift={shift}
            onSessionEnded={handleSessionEnded}
          />
        ) : (
          <div className="space-y-6">
            <Card className="shadow-sm">
              <CardContent className="p-6 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <CardTitle className="text-base font-semibold">
                    No Live Attendance Kiosk Active
                  </CardTitle>
                  <CardDescription className="text-xs max-w-lg mt-1">
                    Launch a new dynamic QR code and PIN check-in session for
                    employees assigned to this work group.
                  </CardDescription>
                </div>
                <Button
                  onClick={() => setShowCreateModal(true)}
                  className="gap-1.5 text-xs self-start sm:self-auto"
                >
                  <Plus className="w-4 h-4" />
                  Launch Check-In Kiosk
                </Button>
              </CardContent>
            </Card>

            <SessionHistory shiftId={shift.id} />
          </div>
        )}
      </main>

      {showCreateModal && (
        <CreateSessionModal
          shift={shift}
          onClose={() => setShowCreateModal(false)}
          onSessionCreated={handleSessionCreated}
        />
      )}
    </div>
  );
}
