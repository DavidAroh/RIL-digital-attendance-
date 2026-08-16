import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { generateQRToken, generatePIN } from '../../utils/qrCode';
import { AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select } from '../ui/select';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import type { Database } from '../../lib/database.types';

type Shift = Database['public']['Tables']['courses']['Row'];

interface CreateSessionModalProps {
  shift: Shift;
  onClose: () => void;
  onSessionCreated: () => void;
}

export function CreateSessionModal({
  shift,
  onClose,
  onSessionCreated,
}: CreateSessionModalProps) {
  const { profile } = useAuth();
  const [sessionName, setSessionName] = useState(
    `Daily Check-In - ${new Date().toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })}`
  );
  const [duration, setDuration] = useState(30);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const qrToken = generateQRToken();
      const pinCode = generatePIN();
      const expiresAt = new Date(Date.now() + duration * 60000).toISOString();

      const { error: insertError } = await supabase
        .from('attendance_sessions')
        .insert({
          course_id: shift.id,
          session_name: sessionName.trim(),
          qr_token: qrToken,
          pin_code: pinCode,
          expires_at: expiresAt,
          is_active: true,
          created_by: profile?.id,
        });

      if (insertError) throw insertError;
      onSessionCreated();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create session'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Launch Attendance Kiosk</DialogTitle>
          <DialogDescription>
            {shift.code} &bull; {shift.title}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="session-name">Session / Kiosk Title</Label>
            <Input
              id="session-name"
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g., Morning Shift Clock-In"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="session-duration">Kiosk Active Duration</Label>
            <Select
              id="session-duration"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              <option value={10}>10 minutes (Quick Standup)</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes (Standard Window)</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
              <option value={480}>8 hours (Full Shift / Kiosk Mode)</option>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Staff must check in before the session expires.
            </p>
          </div>

          <DialogFooter className="pt-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Starting...' : 'Launch Kiosk'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
