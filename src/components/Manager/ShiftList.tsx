import { Building2, ChevronRight, Clock, MapPin } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Badge } from '../ui/badge';
import type { Database } from '../../lib/database.types';

type Shift = Database['public']['Tables']['courses']['Row'];

interface ShiftListProps {
  shifts: Shift[];
  onSelectShift: (shift: Shift) => void;
}

export function ShiftList({ shifts, onSelectShift }: ShiftListProps) {
  if (shifts.length === 0) {
    return (
      <Card className="text-center py-12 max-w-lg mx-auto">
        <CardContent className="space-y-3">
          <div className="mx-auto w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
            <Building2 className="w-6 h-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-base">No Shifts Created Yet</CardTitle>
          <CardDescription className="text-xs max-w-sm mx-auto">
            Create your first department or shift group to start launching live check-in kiosks and tracking employee attendance.
          </CardDescription>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {shifts.map((shift) => (
        <Card
          key={shift.id}
          onClick={() => onSelectShift(shift)}
          className="flex flex-col justify-between shadow-xs hover:border-foreground/40 transition-all cursor-pointer group"
        >
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
              <Badge variant="subtle" className="font-mono text-[10px]">
                {shift.code}
              </Badge>
              <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors">
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>

            <CardTitle className="text-base mt-2 group-hover:text-foreground transition-colors">
              {shift.title}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-2 text-xs">
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
                {shift.level || 'Standard Hours'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center">
                <MapPin className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                Location:
              </span>
              <span className="font-medium text-foreground">
                {shift.semester || 'Main Office'}
              </span>
            </div>
          </CardContent>

          <CardFooter className="pt-3 border-t text-xs text-muted-foreground group-hover:text-foreground font-medium flex items-center justify-between">
            <span>Manage Kiosks & Records</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
