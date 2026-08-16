import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Building2, Users, Clock, MapPin } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
} from '../ui/card';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import type { Database } from '../../lib/database.types';

type Shift = Database['public']['Tables']['courses']['Row'] & {
  profiles?: {
    full_name: string;
  };
  employee_count?: number;
};

export function ShiftManagement() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchShifts();
  }, []);

  const fetchShifts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('courses')
      .select(
        `
        *,
        profiles:lecturer_id (
          full_name
        )
      `
      )
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching shifts:', error);
      setLoading(false);
      return;
    }

    const shiftsWithCounts = await Promise.all(
      (data || []).map(async (shift) => {
        const { count } = await supabase
          .from('course_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('course_id', shift.id);

        return {
          ...shift,
          employee_count: count || 0,
        };
      })
    );

    setShifts(shiftsWithCounts);
    setLoading(false);
  };

  const filteredShifts = shifts.filter((shift) => {
    return (
      shift.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shift.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shift.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (shift.profiles?.full_name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ??
        false)
    );
  });

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
        <p className="text-xs text-muted-foreground mt-3">
          Loading shift data...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Shifts & Department Work Groups ({filteredShifts.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Overview of all company work units, assigned supervisors, and enrolled staff
          </p>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 text-xs h-9"
              placeholder="Search by shift code, title, department, or manager name..."
            />
          </div>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shift / Group</TableHead>
                <TableHead>Manager / Lead</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Shift Type</TableHead>
                <TableHead>Enrolled Staff</TableHead>
                <TableHead className="text-right">Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredShifts.map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0 h-8 w-8 rounded-md bg-muted flex items-center justify-center text-foreground">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <Badge variant="subtle" className="font-mono text-[10px]">
                          {shift.code}
                        </Badge>
                        <div className="font-medium text-foreground text-xs mt-0.5">
                          {shift.title}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-foreground text-xs">
                    {shift.profiles?.full_name || (
                      <span className="text-muted-foreground italic">
                        Unassigned
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-foreground">
                    {shift.department}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {shift.level}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="subtle" className="text-[11px] gap-1">
                      <Users className="w-3 h-3" />
                      {shift.employee_count} staff
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    <span className="inline-flex items-center">
                      <MapPin className="w-3 h-3 mr-1" />
                      {shift.semester}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredShifts.length === 0 && (
            <p className="text-center py-10 text-muted-foreground text-xs">
              No shifts or departments found.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
