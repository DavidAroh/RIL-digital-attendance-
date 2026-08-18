import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
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

interface CreateShiftModalProps {
  onClose: () => void;
  onShiftCreated: () => void;
}

export function CreateShiftModal({
  onClose,
  onShiftCreated,
}: CreateShiftModalProps) {
  const { profile } = useAuth();
  const [formData, setFormData] = useState({
    code: '',
    title: '',
    department: profile?.department || '',
    shift_type: 'Morning Shift (09:00 - 17:00)',
    location: 'HQ Main Office',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: upsertError } = await supabase.from('courses').upsert(
        {
          code: formData.code.trim(),
          title: formData.title.trim(),
          department: formData.department.trim(),
          level: formData.shift_type.trim(),
          semester: formData.location.trim(),
          lecturer_id: profile?.id,
        },
        { onConflict: 'code,lecturer_id' }
      );

      if (upsertError) throw upsertError;
      onShiftCreated();
    } catch (err) {
      const msg = String((err as { message?: string })?.message || err);
      if (/duplicate|conflict|409/i.test(msg)) {
        setError(
          'A shift with these days already exists for your account. Please use a unique title or schedule.'
        );
      } else {
        setError(
          err instanceof Error ? err.message : 'Failed to create shift'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Shift / Work Group</DialogTitle>
          <DialogDescription>
            Configure a workplace department or scheduled shift
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
            <Label htmlFor="shift-code">Days</Label>
            <Input
              id="shift-code"
              type="text"
              value={formData.code}
              onChange={(e) =>
                setFormData({ ...formData, code: e.target.value })
              }
              placeholder="e.g., Mon - Fri, Mon - Sat, Monday - Friday"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shift-title">Shift Title / Description</Label>
            <Input
              id="shift-title"
              type="text"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="e.g., Software Engineering Morning Shift"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shift-dept">Department</Label>
            <Input
              id="shift-dept"
              type="text"
              value={formData.department}
              onChange={(e) =>
                setFormData({ ...formData, department: e.target.value })
              }
              placeholder="e.g., Engineering, Marketing, HR, Finance"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shift-schedule">Shift Schedule Type</Label>
            <Select
              id="shift-schedule"
              value={formData.shift_type}
              onChange={(e) =>
                setFormData({ ...formData, shift_type: e.target.value })
              }
              required
            >
              <option value="Morning Shift (09:00 - 17:00)">
                Morning Shift (09:00 - 17:00)
              </option>
              <option value="Evening Shift (14:00 - 22:00)">
                Evening Shift (14:00 - 22:00)
              </option>
              <option value="Night Shift (22:00 - 06:00)">
                Night Shift (22:00 - 06:00)
              </option>
              <option value="Flexible / Full-Time">Flexible / Full-Time</option>
              <option value="Part-Time / Shifts">Part-Time / Shifts</option>
              <option value="Weekend Shift">Weekend Shift</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shift-loc">Workplace Location / Mode</Label>
            <Select
              id="shift-loc"
              value={formData.location}
              onChange={(e) =>
                setFormData({ ...formData, location: e.target.value })
              }
              required
            >
              <option value="HQ Main Office">HQ Main Office</option>
              <option value="Branch Office">Branch Office</option>
              <option value="Hybrid Workplace">Hybrid Workplace</option>
              <option value="Remote / WFH">Remote / WFH</option>
              <option value="Field / Client Site">Field / Client Site</option>
            </Select>
          </div>

          <DialogFooter className="pt-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Shift'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
