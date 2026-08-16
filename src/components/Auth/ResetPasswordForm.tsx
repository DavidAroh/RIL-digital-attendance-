import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';

export function ResetPasswordForm() {
  const {
    completePasswordReset,
    ensureRecoverySession,
    requestForgotPassword,
  } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);
  const attemptedRecovery = useRef(false);

  useEffect(() => {
    try {
      const last = localStorage.getItem('last_reset_email') || '';
      if (last) setEmail(last);
    } catch {
      void 0;
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await ensureRecoverySession();
      await completePasswordReset(password);
      setSuccess(
        'Password updated successfully! You can now sign in with your new password.'
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to update password';
      if (/Recovery session missing/i.test(msg) && !attemptedRecovery.current) {
        attemptedRecovery.current = true;
        try {
          await ensureRecoverySession();
          await completePasswordReset(password);
          setSuccess(
            'Password updated successfully! You can now sign in with your new password.'
          );
          setError('');
        } catch (e2) {
          setError(
            e2 instanceof Error ? e2.message : 'Failed to update password'
          );
        }
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-sm">
      <CardHeader className="space-y-1 text-center">
        <div className="mx-auto w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-1 text-foreground">
          <KeyRound className="w-5 h-5" />
        </div>
        <CardTitle className="text-xl">Set New Password</CardTitle>
        <CardDescription>
          Enter your new password to regain access to your account
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert variant="success">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {error && /Recovery session missing/i.test(error) && (
            <div className="space-y-2 p-3 rounded-lg border bg-muted/40">
              <Label htmlFor="reset-recovery-email">Work Email</Label>
              <Input
                id="reset-recovery-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your account email"
              />
              <Button
                type="button"
                variant="outline"
                disabled={resending || !email}
                onClick={async () => {
                  setResending(true);
                  try {
                    await requestForgotPassword(email.trim());
                    setSuccess(
                      'A new reset link has been sent. Please check your inbox.'
                    );
                    setError('');
                    try {
                      localStorage.setItem('last_reset_email', email.trim());
                    } catch {
                      void 0;
                    }
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : 'Failed to send reset link'
                    );
                  } finally {
                    setResending(false);
                  }
                }}
                className="w-full mt-2"
              >
                {resending ? 'Sending link...' : 'Send New Reset Link'}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
              required
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full mt-2">
            {loading ? 'Updating Password...' : 'Update Password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
