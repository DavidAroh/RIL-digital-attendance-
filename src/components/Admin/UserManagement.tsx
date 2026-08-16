import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, User, Shield, Briefcase, CheckCircle2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
} from '../ui/card';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import type { Database } from '../../lib/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];

export function UserManagement() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<
    'all' | 'employee' | 'manager' | 'admin'
  >('all');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching users:', error);
    } else {
      // Normalize any legacy role records
      const normalized = (data || []).map((u) => {
        let role = u.role;
        if (role === ('student' as unknown)) role = 'employee';
        if (role === ('lecturer' as unknown)) role = 'manager';
        return {
          ...u,
          role,
          employee_id: u.employee_id || u.matric_number,
        };
      });
      setUsers(normalized);
    }
    setLoading(false);
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.department?.toLowerCase().includes(searchTerm.toLowerCase()) ??
        false);

    const matchesFilter = filter === 'all' || user.role === filter;

    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
        <p className="text-xs text-muted-foreground mt-3">
          Loading user accounts...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Staff & User Directory ({filteredUsers.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Manage organization members, employee profiles, and system privileges
          </p>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 text-xs h-9"
                placeholder="Search by name, email, or department..."
              />
            </div>
            <div className="sm:w-48">
              <Select
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                className="text-xs h-9"
              >
                <option value="all">All Roles</option>
                <option value="employee">Employees / Staff</option>
                <option value="manager">Managers / Leads</option>
                <option value="admin">HR / Admins</option>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee / Staff</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Signature</TableHead>
                <TableHead className="text-right">Date Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-8 w-8 rounded-full">
                        <AvatarFallback className="rounded-full bg-muted text-foreground">
                          {user.role === 'admin' ? (
                            <Shield className="w-3.5 h-3.5" />
                          ) : user.role === 'manager' ? (
                            <Briefcase className="w-3.5 h-3.5" />
                          ) : (
                            <User className="w-3.5 h-3.5" />
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-semibold text-foreground text-xs">
                          {user.full_name}
                        </div>
                        <div className="text-muted-foreground text-[11px]">
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        user.role === 'admin'
                          ? 'default'
                          : user.role === 'manager'
                          ? 'secondary'
                          : 'outline'
                      }
                      className="text-[11px]"
                    >
                      {user.role === 'admin'
                        ? 'HR / Admin'
                        : user.role === 'manager'
                        ? 'Manager'
                        : 'Employee'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-foreground">
                    {user.department || 'Unassigned'}
                  </TableCell>
                  <TableCell>
                    {user.signature_url ? (
                      <span className="flex items-center text-foreground font-medium text-xs gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />{' '}
                        On File
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground font-mono">
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredUsers.length === 0 && (
            <p className="text-center py-10 text-muted-foreground text-xs">
              No users matching search criteria.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
