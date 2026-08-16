import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { decodeSessionData, isSessionExpired } from '../../utils/qrCode';
import {
  saveOfflineCheckIn,
  getPendingCheckIns,
  removeCheckIn,
} from '../../utils/offlineSync';
import {
  QrCode,
  CheckCircle2,
  AlertCircle,
  Wifi,
  WifiOff,
  Upload,
  Pencil,
  UserCheck,
} from 'lucide-react';
import { QRScanner } from './QRScanner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select } from '../ui/select';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';

export function AttendanceScanner() {
  const { profile, refreshProfile } = useAuth();
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [sigFile, setSigFile] = useState<File | null>(null);
  const [sigUploading, setSigUploading] = useState(false);
  const [sigMsg, setSigMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [pf, setPf] = useState({
    full_name: profile?.full_name || '',
    department: profile?.department || '',
    designation: profile?.designation || profile?.level || '',
  });
  const [pfSaving, setPfSaving] = useState(false);
  const [pfMsg, setPfMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const checkPendingCheckIns = useCallback(async () => {
    const pending = await getPendingCheckIns();
    setPendingCount(pending.length);
  }, []);

  const syncPendingCheckIns = useCallback(async () => {
    if (!isOnline) return;

    const pending = await getPendingCheckIns();
    if (pending.length === 0) return;

    setSyncing(true);
    for (const checkIn of pending) {
      try {
        const session = await supabase
          .from('attendance_sessions')
          .select('*')
          .eq('id', checkIn.sessionId)
          .eq('qr_token', checkIn.qrToken)
          .maybeSingle();

        if (!session.data) {
          await removeCheckIn(checkIn.id);
          continue;
        }

        await supabase.from('attendance_records').insert({
          session_id: checkIn.sessionId,
          student_id: profile?.id,
          check_in_method: 'offline_qr',
          synced_from_offline: true,
          offline_scanned_at: checkIn.scannedAt,
        });

        await removeCheckIn(checkIn.id);
      } catch (error) {
        console.error('Error syncing check-in:', error);
      }
    }

    checkPendingCheckIns();
    if (pending.length > 0) {
      setMessage({
        type: 'success',
        text: `Successfully synced ${pending.length} offline check-in(s)`,
      });
    }
    setSyncing(false);
  }, [isOnline, profile?.id, checkPendingCheckIns]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    checkPendingCheckIns();
    syncPendingCheckIns();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkPendingCheckIns, syncPendingCheckIns]);

  useEffect(() => {
    if (isOnline) {
      syncPendingCheckIns();
    }
  }, [isOnline, syncPendingCheckIns]);

  const handleQRScan = async (encoded: string) => {
    if (loading) return;
    setLoading(true);
    setMessage(null);

    try {
      const sessionData = decodeSessionData(encoded);
      if (!sessionData) {
        setMessage({ type: 'error', text: 'Invalid QR code scanned.' });
        setLoading(false);
        return;
      }

      if (isSessionExpired(sessionData.expiresAt)) {
        setMessage({
          type: 'error',
          text: 'This attendance session has expired.',
        });
        setLoading(false);
        return;
      }

      if (!isOnline) {
        await saveOfflineCheckIn({
          sessionId: sessionData.sessionId,
          qrToken: sessionData.qrToken,
          scannedAt: new Date().toISOString(),
          expiresAt: sessionData.expiresAt,
        });
        setMessage({
          type: 'success',
          text: 'Attendance stored locally. Will sync automatically when connection restores.',
        });
        checkPendingCheckIns();
        setLoading(false);
        return;
      }

      const { data: rpcData, error } = await supabase.rpc('qr_checkin', {
        p_session_id: sessionData.sessionId,
        p_qr_token: sessionData.qrToken,
      });

      const resp: { ok?: boolean; error?: string } | null =
        rpcData as unknown as { ok?: boolean; error?: string } | null;

      if (error || (resp && resp.error)) {
        const err =
          resp?.error ??
          (typeof error === 'object' &&
          error &&
          'message' in (error as unknown as { message?: string })
            ? String((error as unknown as { message?: string }).message)
            : 'Failed to clock in');
        const text =
          err === 'duplicate'
            ? 'You have already checked in to this session.'
            : err === 'expired'
            ? 'Attendance session has expired.'
            : err === 'invalid'
            ? 'Invalid QR code.'
            : 'Failed to check in.';
        setMessage({ type: 'error', text });
        setLoading(false);
        return;
      }

      setMessage({
        type: 'success',
        text: 'Clock-in verified! Your attendance has been successfully recorded.',
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'An error occurred during check-in.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSignature = async () => {
    if (!sigFile || !profile?.id) return;
    setSigUploading(true);
    setSigMsg(null);
    try {
      const ext = sigFile.type.includes('png')
        ? 'png'
        : sigFile.type.includes('jpeg')
        ? 'jpg'
        : 'webp';
      const path = `signatures/${profile.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('signatures')
        .upload(path, sigFile, { contentType: sigFile.type, upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage
        .from('signatures')
        .getPublicUrl(path);
      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ signature_url: pub.publicUrl })
        .eq('id', profile.id);
      if (dbErr) throw dbErr;
      setSigMsg({
        type: 'success',
        text: 'Digital signature updated successfully!',
      });
      setSigFile(null);
      await refreshProfile();
    } catch (e) {
      const msg = String((e as { message?: string })?.message || e);
      setSigMsg({ type: 'error', text: msg || 'Failed to upload signature.' });
    } finally {
      setSigUploading(false);
    }
  };

  const handleOpenProfileModal = () => {
    setPf({
      full_name: profile?.full_name || '',
      department: profile?.department || '',
      designation: profile?.designation || profile?.level || '',
    });
    setPfMsg(null);
    setShowProfileModal(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;
    setPfSaving(true);
    setPfMsg(null);
    try {
      const desig = pf.designation.trim() || null;
      const { error: upErr } = await supabase
        .from('profiles')
        .update({
          full_name: pf.full_name.trim(),
          department: pf.department.trim() || null,
          designation: desig,
          level: desig,
        })
        .eq('id', profile.id);
      if (upErr) throw upErr;
      await refreshProfile();
      setPfMsg({ type: 'success', text: 'Profile details updated!' });
      setTimeout(() => setShowProfileModal(false), 900);
    } catch (e) {
      const msg = String((e as { message?: string })?.message || e);
      setPfMsg({ type: 'error', text: msg || 'Failed to update profile.' });
    } finally {
      setPfSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Network & Offline Status Banner */}
      <Card className="shadow-xs border bg-card">
        <CardContent className="p-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isOnline ? (
              <>
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <Wifi className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">
                  Connected to Workspace Network
                </span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                <WifiOff className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-medium text-amber-700">
                  Offline Mode (Check-ins saved locally)
                </span>
              </>
            )}
          </div>

          {pendingCount > 0 && (
            <div className="flex items-center space-x-2">
              <Badge variant="pending" className="text-xs">
                {pendingCount} pending sync
              </Badge>
              {isOnline && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={syncPendingCheckIns}
                  disabled={syncing}
                  className="h-auto p-0 text-xs font-semibold"
                >
                  {syncing ? 'Syncing...' : 'Sync now'}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Check-In Card */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-lg bg-muted text-foreground">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base">Workplace Check-In</CardTitle>
              <CardDescription className="text-xs">
                Scan active kiosk QR code with camera or upload photo
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {message && (
            <Alert
              variant={message.type === 'success' ? 'success' : 'destructive'}
              className="mb-6"
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          <QRScanner onScan={handleQRScan} />
        </CardContent>
      </Card>

      {/* Verified Profile & Signature Badge Card */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center space-x-2">
            <UserCheck className="w-4 h-4 text-foreground" />
            <CardTitle className="text-sm font-semibold">
              Staff Verification Profile
            </CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenProfileModal}
            className="h-7 text-xs gap-1"
          >
            <Pencil className="w-3 h-3" />
            Edit Profile
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-lg border bg-muted/30 space-y-1">
              <p className="text-muted-foreground font-medium">Staff Member</p>
              <p className="text-sm font-semibold text-foreground">
                {profile?.full_name || '—'}
              </p>
              <p className="text-muted-foreground pt-1">
                Role:{' '}
                <span className="font-medium text-foreground">
                  {profile?.designation || profile?.level || 'Full-Time Staff'}
                </span>
              </p>
            </div>

            <div className="p-3.5 rounded-lg border bg-muted/30 space-y-1">
              <p className="text-muted-foreground font-medium">Department</p>
              <p className="text-sm font-semibold text-foreground">
                {profile?.department || 'General'}
              </p>
              <p className="text-muted-foreground pt-1">
                Account Status:{' '}
                <span className="font-medium text-emerald-600">Active</span>
              </p>
            </div>
          </div>

          {/* Digital Signature section */}
          <div className="pt-3 border-t space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-foreground">
                  Digital Verification Signature
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Included on attendance exports and audit trails
                </p>
              </div>
              {profile?.signature_url ? (
                <div className="flex items-center space-x-2">
                  <img
                    src={profile.signature_url}
                    alt="Verified Signature"
                    className="h-9 object-contain border rounded-md px-2 bg-background"
                  />
                  <Badge variant="active" className="gap-1 text-[11px]">
                    <CheckCircle2 className="w-3 h-3" /> Verified
                  </Badge>
                </div>
              ) : (
                <Badge variant="subtle" className="text-[11px]">
                  Signature missing
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setSigFile(e.target.files?.[0] || null)}
                className="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer"
              />
              {sigFile && (
                <Button
                  size="sm"
                  onClick={handleUploadSignature}
                  disabled={sigUploading}
                  className="shrink-0 h-9 gap-1 text-xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {sigUploading ? 'Saving...' : 'Save Signature'}
                </Button>
              )}
            </div>
            {sigMsg && (
              <p
                className={`text-xs ${
                  sigMsg.type === 'success'
                    ? 'text-emerald-700'
                    : 'text-destructive'
                }`}
              >
                {sigMsg.text}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Profile Dialog */}
      <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Staff Profile</DialogTitle>
            <DialogDescription>
              Update your personal and departmental credentials
            </DialogDescription>
          </DialogHeader>

          {pfMsg && (
            <Alert
              variant={pfMsg.type === 'success' ? 'success' : 'destructive'}
            >
              <AlertDescription>{pfMsg.text}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="pf-name">Full Name</Label>
              <Input
                id="pf-name"
                type="text"
                value={pf.full_name}
                onChange={(e) => setPf({ ...pf, full_name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pf-dept">Department</Label>
              <Input
                id="pf-dept"
                type="text"
                value={pf.department}
                onChange={(e) => setPf({ ...pf, department: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pf-type">Employment Type</Label>
              <Select
                id="pf-type"
                value={pf.designation}
                onChange={(e) => setPf({ ...pf, designation: e.target.value })}
              >
                <option value="Full-Time">Full-Time</option>
                <option value="Part-Time">Part-Time</option>
                <option value="Contractor">Contractor</option>
                <option value="Intern">Intern</option>
                <option value="Remote">Remote Staff</option>
              </Select>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowProfileModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pfSaving}>
                {pfSaving ? 'Saving...' : 'Save Profile'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
