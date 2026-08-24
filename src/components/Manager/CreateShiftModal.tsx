import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { AlertCircle, Clock } from 'lucide-react';
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

const DAY_OPTIONS = [
  { index: 0, short: 'Sun', long: 'Sunday' },
  { index: 1, short: 'Mon', long: 'Monday' },
  { index: 2, short: 'Tue', long: 'Tuesday' },
  { index: 3, short: 'Wed', long: 'Wednesday' },
  { index: 4, short: 'Thu', long: 'Thursday' },
  { index: 5, short: 'Fri', long: 'Friday' },
  { index: 6, short: 'Sat', long: 'Saturday' },
];

// "Mon - Fri", "Sat, Sun", "Mon - Wed, Fri" — collapses runs of 3+ into a range
function formatDayLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  if (sorted.length === 7) return 'Sun - Sat';

  const runs: number[][] = [];
  sorted.forEach((d) => {
    const last = runs[runs.length - 1];
    if (last && d === last[last.length - 1] + 1) last.push(d);
    else runs.push([d]);
  });

  return runs
    .map((run) =>
      run.length >= 3
        ? `${DAY_OPTIONS[run[0]].short} - ${DAY_OPTIONS[run[run.length - 1]].short}`
        : run.map((d) => DAY_OPTIONS[d].short).join(', ')
    )
    .join(', ');
}

// Default working hours per shift type — the starting point for each day,
// which the manager can then override day by day.
const SHIFT_TYPES = [
  { value: 'Morning Shift (09:00 - 17:00)', start: '09:00', end: '17:00' },
  { value: 'Evening Shift (14:00 - 22:00)', start: '14:00', end: '22:00' },
  { value: 'Night Shift (22:00 - 06:00)', start: '22:00', end: '06:00' },
  { value: 'Flexible / Full-Time', start: '09:00', end: '17:00' },
  { value: 'Part-Time / Shifts', start: '09:00', end: '13:00' },
  { value: 'Weekend Shift', start: '10:00', end: '16:00' },
];

const FALLBACK_HOURS = { start: '09:00', end: '17:00' };

type DayHours = { start: string; end: string };

function defaultHoursFor(shiftType: string): DayHours {
  const match = SHIFT_TYPES.find((t) => t.value === shiftType);
  return match
    ? { start: match.start, end: match.end }
    : { ...FALLBACK_HOURS };
}

// Panel sits under the chip; nudge the edge days inward so it stays in the dialog
function panelAlignment(index: number): string {
  if (index <= 1) return 'left-0';
  if (index >= 5) return 'right-0';
  return 'left-1/2 -translate-x-1/2';
}

export function CreateShiftModal({
  onClose,
  onShiftCreated,
}: CreateShiftModalProps) {
  const { profile } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    department: profile?.department || '',
    shift_type: 'Morning Shift (09:00 - 17:00)',
    location: 'HQ Main Office',
  });
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  // Only days with hours that differ from the shift-type default live here;
  // the rest follow the default automatically when the shift type changes.
  const [dayHours, setDayHours] = useState<Record<number, DayHours>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const dayLabel = formatDayLabel(selectedDays);
  const defaultHours = defaultHoursFor(formData.shift_type);
  const hoursFor = (index: number): DayHours => dayHours[index] ?? defaultHours;

  const hoursSummary = (() => {
    const ranges = new Set(
      selectedDays.map((d) => `${hoursFor(d).start} - ${hoursFor(d).end}`)
    );
    if (ranges.size === 0) return '';
    if (ranges.size === 1) return [...ranges][0];
    return `${ranges.size} different time ranges`;
  })();

  const resetDayHours = (index: number) => {
    setDayHours((prev) => {
      if (!prev[index]) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const toggleDay = (index: number) => {
    const isDeselecting = selectedDays.includes(index);
    setSelectedDays((prev) =>
      isDeselecting
        ? prev.filter((d) => d !== index)
        : [...prev, index].sort((a, b) => a - b)
    );
    // Dropping a day drops its custom hours too, so nothing stale gets saved
    if (isDeselecting) resetDayHours(index);
  };

  const setDayHour = (index: number, field: 'start' | 'end', value: string) => {
    if (!value) return;
    setDayHours((prev) => ({
      ...prev,
      [index]: { ...(prev[index] ?? defaultHours), [field]: value },
    }));
    // Setting hours for a day implies it should be scheduled
    setSelectedDays((prev) =>
      prev.includes(index) ? prev : [...prev, index].sort((a, b) => a - b)
    );
  };

  const applyHoursToAll = (index: number) => {
    const source = hoursFor(index);
    setDayHours((prev) => {
      const next = { ...prev };
      const targets = selectedDays.includes(index)
        ? selectedDays
        : [...selectedDays, index];
      targets.forEach((d) => {
        next[d] = { ...source };
      });
      return next;
    });
    setSelectedDays((prev) =>
      prev.includes(index) ? prev : [...prev, index].sort((a, b) => a - b)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (selectedDays.length === 0) {
      setError('Select at least one day of the week for this shift.');
      return;
    }

    setLoading(true);

    try {
      const basePayload = {
        code: dayLabel,
        title: formData.title.trim(),
        department: formData.department.trim(),
        level: formData.shift_type.trim(),
        semester: formData.location.trim(),
        lecturer_id: profile?.id,
      };
      const schedule = {
        days: selectedDays.map((d) => ({
          day: d,
          start: hoursFor(d).start,
          end: hoursFor(d).end,
        })),
      };

      let { error: upsertError } = await supabase
        .from('courses')
        .upsert({ ...basePayload, schedule }, { onConflict: 'code,lecturer_id' });

      // The schedule column ships in a migration; if it hasn't been applied yet,
      // still create the shift rather than blocking the manager.
      const missingColumn =
        upsertError &&
        (upsertError.code === 'PGRST204' ||
          /schedule/i.test(upsertError.message || ''));
      if (missingColumn) {
        ({ error: upsertError } = await supabase
          .from('courses')
          .upsert(basePayload, { onConflict: 'code,lecturer_id' }));
      }

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
            <Label>Days &amp; Hours</Label>
            <div className="grid grid-cols-7 gap-1.5">
              {DAY_OPTIONS.map((day) => {
                const isSelected = selectedDays.includes(day.index);
                const isWeekend = day.index === 0 || day.index === 6;
                const hours = hoursFor(day.index);
                const isCustom = Boolean(dayHours[day.index]);

                return (
                  <div key={day.index} className="group relative">
                    <button
                      type="button"
                      onClick={() => toggleDay(day.index)}
                      aria-pressed={isSelected}
                      className={`relative h-11 w-full rounded-lg border text-xs font-semibold transition-all ${
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                          : isWeekend
                          ? 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                          : 'bg-background text-foreground hover:bg-muted/50 hover:border-foreground/20'
                      }`}
                    >
                      {day.short}
                      {isCustom && (
                        <span
                          className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500"
                          title="Custom hours"
                        />
                      )}
                    </button>

                    {/* Hover (or keyboard focus) opens the editable hours for this day */}
                    <div
                      className={`absolute top-full z-30 hidden pt-1.5 group-hover:block group-focus-within:block ${panelAlignment(
                        day.index
                      )}`}
                    >
                      <div className="w-[188px] space-y-2 rounded-lg border bg-popover p-2.5 text-popover-foreground shadow-md">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold">
                            {day.long}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                            <Clock className="h-2.5 w-2.5 flex-shrink-0" />
                            {hours.start} - {hours.end}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <div className="space-y-1">
                            <Label
                              htmlFor={`day-${day.index}-start`}
                              className="text-[10px] text-muted-foreground"
                            >
                              Start
                            </Label>
                            <Input
                              id={`day-${day.index}-start`}
                              type="time"
                              value={hours.start}
                              onChange={(e) =>
                                setDayHour(day.index, 'start', e.target.value)
                              }
                              className="h-8 px-2 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label
                              htmlFor={`day-${day.index}-end`}
                              className="text-[10px] text-muted-foreground"
                            >
                              End
                            </Label>
                            <Input
                              id={`day-${day.index}-end`}
                              type="time"
                              value={hours.end}
                              onChange={(e) =>
                                setDayHour(day.index, 'end', e.target.value)
                              }
                              className="h-8 px-2 text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => applyHoursToAll(day.index)}
                            className="text-[10px] font-semibold text-primary hover:underline"
                          >
                            Apply to all days
                          </button>
                          {isCustom && (
                            <button
                              type="button"
                              onClick={() => resetDayHours(day.index)}
                              className="text-[10px] text-muted-foreground hover:underline"
                            >
                              Reset
                            </button>
                          )}
                        </div>

                        {!isSelected && (
                          <p className="text-[10px] text-muted-foreground">
                            Not scheduled — click {day.short} to add it.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {selectedDays.length > 0 ? (
                <>
                  Selected:{' '}
                  <span className="font-semibold text-foreground">{dayLabel}</span>{' '}
                  &middot; {hoursSummary}
                </>
              ) : (
                'Tap the days this shift runs — hover a day to set its hours.'
              )}
            </p>
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
              {SHIFT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.value}
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Sets the default hours ({defaultHours.start} - {defaultHours.end})
              for every day that has no custom hours.
            </p>
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
            <Button type="submit" disabled={loading || selectedDays.length === 0}>
              {loading ? 'Creating...' : 'Create Shift'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
