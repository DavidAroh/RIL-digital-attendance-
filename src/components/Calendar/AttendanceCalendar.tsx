import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Users,
  Building2,
  Search,
  Filter,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  Check,
  X,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';
import type { Database } from '../../lib/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Shift = Database['public']['Tables']['courses']['Row'];
type AttendanceSession =
  Database['public']['Tables']['attendance_sessions']['Row'];
type AttendanceRecord =
  Database['public']['Tables']['attendance_records']['Row'];

interface AttendanceCalendarProps {
  managerId?: string; // If provided, limits to manager's shifts and employees
  initialShiftId?: string;
  initialUserId?: string;
  onBack?: () => void;
}

interface DayAttendanceDetail {
  date: Date;
  dateKey: string; // YYYY-MM-DD
  isCurrentMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  hasSessions: boolean;
  // For individual staff view
  status?: 'signed' | 'missed' | 'none';
  signedSessions: Array<{
    session: AttendanceSession;
    record: AttendanceRecord;
    shift?: Shift;
  }>;
  missedSessions: Array<{
    session: AttendanceSession;
    shift?: Shift;
  }>;
  // For shift view
  shiftSessions: AttendanceSession[];
  attendeesCount: number;
  totalEnrolledCount: number;
  roster: Array<{
    profile: Profile;
    signed: boolean;
    record?: AttendanceRecord;
  }>;
}

export function AttendanceCalendar({
  managerId,
  initialShiftId,
  initialUserId,
  onBack,
}: AttendanceCalendarProps) {
  // Calendar Navigation
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<'employee' | 'shift'>('employee');

  // Filter & Selection State
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>(
    initialShiftId || 'all'
  );
  const [selectedUserId, setSelectedUserId] = useState<string>(
    initialUserId || ''
  );
  const [searchEmployeeQuery, setSearchEmployeeQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

  // Raw Database Data for Selected Month
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [registrations, setRegistrations] = useState<
    Array<{ course_id: string; student_id: string }>
  >([]);

  // UI States
  const [loading, setLoading] = useState(true);
  const [selectedDayDetail, setSelectedDayDetail] =
    useState<DayAttendanceDetail | null>(null);
  const [isDayDialogOpen, setIsDayDialogOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  // Month & Year calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // 1. Initial Load: Fetch Shifts and Staff Profiles
  useEffect(() => {
    async function loadMeta() {
      try {
        let shiftsQuery = supabase.from('courses').select('*');
        if (managerId) {
          shiftsQuery = shiftsQuery.eq('lecturer_id', managerId);
        }
        const { data: shiftsData } = await shiftsQuery.order('title', {
          ascending: true,
        });
        const loadedShifts = shiftsData || [];
        setShifts(loadedShifts);

        const profilesQuery = supabase
          .from('profiles')
          .select('*')
          .order('full_name', { ascending: true });

        const { data: profilesData } = await profilesQuery;
        const allProfiles = (profilesData || []).map((p) => {
          let role = p.role;
          if (role === ('student' as unknown)) role = 'employee';
          if (role === ('lecturer' as unknown)) role = 'manager';
          return {
            ...p,
            role,
            employee_id: p.employee_id || p.matric_number,
          };
        });

        // If managerId is provided, we can filter staff who are enrolled in manager's shifts
        if (managerId && loadedShifts.length > 0) {
          const shiftIds = loadedShifts.map((s) => s.id);
          const { data: regData } = await supabase
            .from('course_registrations')
            .select('student_id')
            .in('course_id', shiftIds);

          const studentIds = new Set((regData || []).map((r) => r.student_id));
          const managerEmployees = allProfiles.filter(
            (p) => studentIds.has(p.id) || p.role === 'employee'
          );
          setEmployees(managerEmployees);
          if (!selectedUserId && managerEmployees.length > 0) {
            setSelectedUserId(managerEmployees[0].id);
          }
        } else {
          setEmployees(allProfiles);
          if (!selectedUserId && allProfiles.length > 0) {
            const firstEmp =
              allProfiles.find((p) => p.role === 'employee') || allProfiles[0];
            setSelectedUserId(firstEmp.id);
          }
        }

        if (initialShiftId) {
          setSelectedShiftId(initialShiftId);
          setViewMode('shift');
        }
        if (initialUserId) {
          setSelectedUserId(initialUserId);
          setViewMode('employee');
        }
      } catch (err) {
        console.error('Error loading metadata:', err);
      }
    }
    loadMeta();
  }, [managerId, initialShiftId, initialUserId]);

  // 2. Fetch Sessions, Records, and Registrations for the current month view
  const fetchMonthData = useCallback(async () => {
    setLoading(true);

    // Calculate month boundary
    const startDate = new Date(year, month - 1, 20); // buffer past month days
    const endDate = new Date(year, month + 2, 10); // buffer next month days
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    try {
      // 1. Fetch Sessions
      let sessionsQuery = supabase
        .from('attendance_sessions')
        .select('*')
        .gte('started_at', startIso)
        .lte('started_at', endIso);

      if (managerId && shifts.length > 0) {
        const shiftIds = shifts.map((s) => s.id);
        sessionsQuery = sessionsQuery.in('course_id', shiftIds);
      } else if (selectedShiftId !== 'all') {
        sessionsQuery = sessionsQuery.eq('course_id', selectedShiftId);
      }

      const { data: sessionsData, error: sessErr } = await sessionsQuery;
      if (sessErr) console.error('Error fetching sessions:', sessErr);
      const loadedSessions = sessionsData || [];
      setSessions(loadedSessions);

      // 2. Fetch Registrations
      const { data: regData } = await supabase
        .from('course_registrations')
        .select('course_id, student_id');
      setRegistrations(regData || []);

      // 3. Fetch Records for loaded sessions
      const sessionIds = loadedSessions.map((s) => s.id);
      if (sessionIds.length > 0) {
        // Chunk requests if needed
        const { data: recData, error: recErr } = await supabase
          .from('attendance_records')
          .select('*')
          .in('session_id', sessionIds);

        if (recErr) console.error('Error fetching attendance records:', recErr);
        setRecords(recData || []);
      } else {
        setRecords([]);
      }
    } catch (e) {
      console.error('Error fetching month data:', e);
    } finally {
      setLoading(false);
    }
  }, [year, month, managerId, shifts, selectedShiftId]);

  useEffect(() => {
    fetchMonthData();
  }, [fetchMonthData]);

  // Unique departments for filtering
  const departments = useMemo(() => {
    const deps = new Set<string>();
    employees.forEach((e) => {
      if (e.department) deps.add(e.department);
    });
    return Array.from(deps).sort();
  }, [employees]);

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchesSearch =
        emp.full_name
          .toLowerCase()
          .includes(searchEmployeeQuery.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchEmployeeQuery.toLowerCase()) ||
        (emp.employee_id?.toLowerCase() || '').includes(
          searchEmployeeQuery.toLowerCase()
        );
      const matchesDep =
        selectedDepartment === 'all' || emp.department === selectedDepartment;
      return matchesSearch && matchesDep;
    });
  }, [employees, searchEmployeeQuery, selectedDepartment]);

  // Selected Profile
  const selectedProfile = useMemo(() => {
    return employees.find((e) => e.id === selectedUserId) || null;
  }, [employees, selectedUserId]);

  // Selected Shift
  const selectedShift = useMemo(() => {
    return shifts.find((s) => s.id === selectedShiftId) || null;
  }, [shifts, selectedShiftId]);

  // Map shifts by ID
  const shiftMap = useMemo(() => {
    const map = new Map<string, Shift>();
    shifts.forEach((s) => map.set(s.id, s));
    return map;
  }, [shifts]);

  // Map profiles by ID
  const profileMap = useMemo(() => {
    const map = new Map<string, Profile>();
    employees.forEach((p) => map.set(p.id, p));
    return map;
  }, [employees]);

  // Compute Calendar Grid Days
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 for Sunday
    const lastDateOfMonth = new Date(year, month + 1, 0).getDate();
    const lastDateOfPrevMonth = new Date(year, month, 0).getDate();

    const todayStr = new Date().toISOString().slice(0, 10);
    const now = new Date();

    const days: DayAttendanceDetail[] = [];

    // Helper: format YYYY-MM-DD in local time
    const formatDateKey = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    // 1. Previous Month Leading Days
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, lastDateOfPrevMonth - i);
      const dateKey = formatDateKey(d);
      days.push(
        buildDayDetail(
          d,
          dateKey,
          false,
          dateKey === todayStr,
          d > now,
          sessions,
          records,
          registrations,
          viewMode,
          selectedUserId,
          selectedShiftId,
          shiftMap,
          profileMap
        )
      );
    }

    // 2. Current Month Days
    for (let day = 1; day <= lastDateOfMonth; day++) {
      const d = new Date(year, month, day);
      const dateKey = formatDateKey(d);
      days.push(
        buildDayDetail(
          d,
          dateKey,
          true,
          dateKey === todayStr,
          d > now,
          sessions,
          records,
          registrations,
          viewMode,
          selectedUserId,
          selectedShiftId,
          shiftMap,
          profileMap
        )
      );
    }

    // 3. Next Month Trailing Days (fill 35 or 42 grid slots)
    const remainingSlots = (7 - (days.length % 7)) % 7;
    for (let day = 1; day <= remainingSlots; day++) {
      const d = new Date(year, month + 1, day);
      const dateKey = formatDateKey(d);
      days.push(
        buildDayDetail(
          d,
          dateKey,
          false,
          dateKey === todayStr,
          d > now,
          sessions,
          records,
          registrations,
          viewMode,
          selectedUserId,
          selectedShiftId,
          shiftMap,
          profileMap
        )
      );
    }

    return days;
  }, [
    year,
    month,
    sessions,
    records,
    registrations,
    viewMode,
    selectedUserId,
    selectedShiftId,
    shiftMap,
    profileMap,
  ]);

  // Statistics for current month
  const monthlyStats = useMemo(() => {
    const currentMonthDays = calendarDays.filter((d) => d.isCurrentMonth);

    if (viewMode === 'employee') {
      let totalSessionDays = 0;
      let signedDays = 0;
      let missedDays = 0;
      let qrCount = 0;
      let pinCount = 0;
      let offlineQrCount = 0;

      currentMonthDays.forEach((day) => {
        if (day.hasSessions) {
          totalSessionDays++;
          if (day.status === 'signed') {
            signedDays++;
            day.signedSessions.forEach((s) => {
              if (s.record.check_in_method === 'qr') qrCount++;
              else if (s.record.check_in_method === 'pin') pinCount++;
              else if (s.record.check_in_method === 'offline_qr')
                offlineQrCount++;
            });
          } else if (day.status === 'missed') {
            missedDays++;
          }
        }
      });

      const rate =
        totalSessionDays > 0
          ? Math.round((signedDays / totalSessionDays) * 100)
          : 0;

      return {
        totalSessionDays,
        signedDays,
        missedDays,
        rate,
        qrCount,
        pinCount,
        offlineQrCount,
      };
    } else {
      // Shift Overview Stats
      let totalShiftSessions = 0;
      let totalExpectedAttendance = 0;
      let totalActualAttendance = 0;

      currentMonthDays.forEach((day) => {
        if (day.shiftSessions.length > 0) {
          totalShiftSessions += day.shiftSessions.length;
          totalExpectedAttendance += day.totalEnrolledCount;
          totalActualAttendance += day.attendeesCount;
        }
      });

      const rate =
        totalExpectedAttendance > 0
          ? Math.round((totalActualAttendance / totalExpectedAttendance) * 100)
          : 0;

      return {
        totalShiftSessions,
        totalExpectedAttendance,
        totalActualAttendance,
        rate,
      };
    }
  }, [calendarDays, viewMode]);

  // Month navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleJumpToToday = () => {
    setCurrentDate(new Date());
  };

  const handleMonthSelect = (mIndex: number) => {
    setCurrentDate(new Date(year, mIndex, 1));
  };

  const handleYearSelect = (yVal: number) => {
    setCurrentDate(new Date(yVal, month, 1));
  };

  // Day Click Dialog
  const handleDayClick = (day: DayAttendanceDetail) => {
    setSelectedDayDetail(day);
    setIsDayDialogOpen(true);
  };

  // Export to Excel
  const handleExportExcel = async () => {
    setExporting('excel');
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Attendance Calendar');

      if (viewMode === 'employee' && selectedProfile) {
        sheet.addRow(['STAFF ATTENDANCE CALENDAR REPORT']);
        sheet.addRow([`Employee: ${selectedProfile.full_name}`]);
        sheet.addRow([`Email: ${selectedProfile.email}`]);
        sheet.addRow([`Department: ${selectedProfile.department || 'N/A'}`]);
        sheet.addRow([
          `Employee ID: ${
            selectedProfile.employee_id || selectedProfile.matric_number || 'N/A'
          }`,
        ]);
        sheet.addRow([`Month: ${monthNames[month]} ${year}`]);
        sheet.addRow([
          `Attendance Rate: ${monthlyStats.rate}% (${monthlyStats.signedDays}/${monthlyStats.totalSessionDays} days signed)`,
        ]);
        sheet.addRow([]);

        sheet.addRow([
          'Date',
          'Day',
          'Status',
          'Shift / Work Group',
          'Session Name',
          'Clock-In Time',
          'Check-In Method',
        ]);

        const headerRow = sheet.getRow(9);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF18181B' },
        };

        const currentMonthDays = calendarDays.filter((d) => d.isCurrentMonth);
        currentMonthDays.forEach((d) => {
          if (!d.hasSessions) {
            sheet.addRow([
              d.dateKey,
              daysOfWeek[d.date.getDay()],
              'NO SESSION / OFF',
              '—',
              '—',
              '—',
              '—',
            ]);
          } else if (d.status === 'signed') {
            d.signedSessions.forEach((s) => {
              sheet.addRow([
                d.dateKey,
                daysOfWeek[d.date.getDay()],
                'SIGNED (PRESENT)',
                s.shift?.title || s.shift?.code || 'Shift',
                s.session.session_name,
                new Date(s.record.checked_in_at).toLocaleTimeString(),
                s.record.check_in_method.toUpperCase(),
              ]);
            });
          } else {
            d.missedSessions.forEach((s) => {
              sheet.addRow([
                d.dateKey,
                daysOfWeek[d.date.getDay()],
                'MISSED (ABSENT)',
                s.shift?.title || s.shift?.code || 'Shift',
                s.session.session_name,
                '—',
                '—',
              ]);
            });
          }
        });
      } else {
        // Shift Overview Export
        sheet.addRow(['SHIFT ATTENDANCE CALENDAR REPORT']);
        sheet.addRow([
          `Shift / Group: ${
            selectedShift ? `${selectedShift.code} - ${selectedShift.title}` : 'All Shifts'
          }`,
        ]);
        sheet.addRow([`Month: ${monthNames[month]} ${year}`]);
        sheet.addRow([
          `Overall Attendance: ${monthlyStats.rate}% (${
            'totalActualAttendance' in monthlyStats
              ? monthlyStats.totalActualAttendance
              : 0
          }/${
            'totalExpectedAttendance' in monthlyStats
              ? monthlyStats.totalExpectedAttendance
              : 0
          })`,
        ]);
        sheet.addRow([]);

        sheet.addRow([
          'Date',
          'Day',
          'Sessions Held',
          'Staff Signed',
          'Staff Missed',
          'Compliance Rate',
        ]);

        const headerRow = sheet.getRow(6);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF18181B' },
        };

        const currentMonthDays = calendarDays.filter((d) => d.isCurrentMonth);
        currentMonthDays.forEach((d) => {
          if (d.shiftSessions.length === 0) {
            sheet.addRow([
              d.dateKey,
              daysOfWeek[d.date.getDay()],
              0,
              0,
              0,
              'N/A',
            ]);
          } else {
            const missedCount = d.totalEnrolledCount - d.attendeesCount;
            const rateStr =
              d.totalEnrolledCount > 0
                ? `${Math.round((d.attendeesCount / d.totalEnrolledCount) * 100)}%`
                : '100%';
            sheet.addRow([
              d.dateKey,
              daysOfWeek[d.date.getDay()],
              d.shiftSessions.length,
              d.attendeesCount,
              Math.max(0, missedCount),
              rateStr,
            ]);
          }
        });
      }

      sheet.columns.forEach((col) => {
        col.width = 24;
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Attendance_Calendar_${monthNames[month]}_${year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting calendar excel:', err);
    } finally {
      setExporting(null);
    }
  };

  // Export to PDF
  const handleExportPDF = async () => {
    setExporting('pdf');
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });

      // Clean corporate Header
      doc.setFillColor(24, 24, 27);
      doc.rect(0, 0, doc.internal.pageSize.getWidth(), 55, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.text('STAFF ATTENDANCE CALENDAR REPORT', 40, 34);

      doc.setTextColor(50, 50, 50);
      doc.setFontSize(10);
      let top = 80;

      if (viewMode === 'employee' && selectedProfile) {
        doc.text(`Staff Name: ${selectedProfile.full_name}`, 40, top);
        doc.text(
          `Employee ID: ${
            selectedProfile.employee_id || selectedProfile.matric_number || '—'
          }`,
          300,
          top
        );
        top += 16;
        doc.text(`Department: ${selectedProfile.department || 'General'}`, 40, top);
        doc.text(`Month & Year: ${monthNames[month]} ${year}`, 300, top);
        top += 16;
        doc.text(
          `Monthly Compliance: ${monthlyStats.rate}% (${monthlyStats.signedDays} Signed, ${monthlyStats.missedDays} Missed)`,
          40,
          top
        );
        top += 25;

        // Table Header
        doc.setFillColor(244, 244, 245);
        doc.rect(
          40,
          top - 14,
          doc.internal.pageSize.getWidth() - 80,
          20,
          'F'
        );
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        doc.text('Date', 50, top);
        doc.text('Status', 130, top);
        doc.text('Shift / Session', 230, top);
        doc.text('Clock-In Time', 420, top);

        top += 20;
        const currentMonthDays = calendarDays.filter((d) => d.isCurrentMonth);
        currentMonthDays.forEach((d) => {
          if (top > doc.internal.pageSize.getHeight() - 50) {
            doc.addPage();
            top = 40;
          }

          if (d.hasSessions) {
            doc.setFontSize(8.5);
            if (d.status === 'signed') {
              doc.setTextColor(22, 101, 52); // Green
              doc.text(`${d.dateKey} (${daysOfWeek[d.date.getDay()]})`, 50, top);
              doc.text('SIGNED [✓]', 130, top);
              doc.setTextColor(30, 30, 30);
              const sess = d.signedSessions[0];
              doc.text(
                sess ? `${sess.shift?.code || ''} ${sess.session.session_name}` : 'Session',
                230,
                top
              );
              doc.text(
                sess ? new Date(sess.record.checked_in_at).toLocaleTimeString() : '—',
                420,
                top
              );
            } else {
              doc.setTextColor(185, 28, 28); // Red
              doc.text(`${d.dateKey} (${daysOfWeek[d.date.getDay()]})`, 50, top);
              doc.text('MISSED [✗]', 130, top);
              doc.setTextColor(30, 30, 30);
              const sess = d.missedSessions[0];
              doc.text(
                sess ? `${sess.shift?.code || ''} ${sess.session.session_name}` : 'Session',
                230,
                top
              );
              doc.text('No clock-in log', 420, top);
            }
            top += 18;
          }
        });
      }

      doc.save(`Attendance_Calendar_${monthNames[month]}_${year}.pdf`);
    } catch (e) {
      console.error('Error generating PDF:', e);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header / Action Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-background p-4 rounded-xl border shadow-xs">
        <div className="flex items-center space-x-3">
          {onBack && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="h-8 px-2 text-xs"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}
          <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">
                Staff Attendance Calendar
              </h2>
              <Badge variant="subtle" className="text-[10px] uppercase font-mono">
                Compliance View
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Daily visual clock-in status: <span className="text-emerald-700 font-semibold inline-flex items-center gap-0.5"><Check className="w-3 h-3" /> Green Tick for Signed</span> &bull; <span className="text-rose-700 font-semibold inline-flex items-center gap-0.5"><X className="w-3 h-3" /> Red X for Missed</span>
            </p>
          </div>
        </div>

        {/* View Mode Toggle & Export */}
        <div className="flex flex-wrap items-center gap-2.5 self-stretch md:self-auto">
          <div className="flex items-center bg-muted/60 p-1 rounded-lg border text-xs">
            <button
              onClick={() => setViewMode('employee')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                viewMode === 'employee'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              Individual Staff
            </button>
            <button
              onClick={() => setViewMode('shift')}
              className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                viewMode === 'shift'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Shift Overview
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={exporting !== null || loading}
            className="h-8 text-xs gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            disabled={exporting !== null || loading}
            className="h-8 text-xs gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            PDF
          </Button>
        </div>
      </div>

      {/* Selectors / Filters Bar */}
      <Card className="shadow-xs border bg-card">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* View Mode: Employee Selection */}
            {viewMode === 'employee' && (
              <>
                <div className="lg:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    Select Staff Member
                  </label>
                  <Select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="text-xs h-9"
                  >
                    {filteredEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} ({emp.email}){' '}
                        {emp.department ? `• ${emp.department}` : ''}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                    Filter by Department
                  </label>
                  <Select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="text-xs h-9"
                  >
                    <option value="all">All Departments ({employees.length})</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                    Search Staff Directory
                  </label>
                  <Input
                    type="text"
                    value={searchEmployeeQuery}
                    onChange={(e) => setSearchEmployeeQuery(e.target.value)}
                    placeholder="Search name, ID or email..."
                    className="text-xs h-9"
                  />
                </div>
              </>
            )}

            {/* View Mode: Shift Selection */}
            {viewMode === 'shift' && (
              <>
                <div className="lg:col-span-3 space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                    Select Shift / Work Group
                  </label>
                  <Select
                    value={selectedShiftId}
                    onChange={(e) => setSelectedShiftId(e.target.value)}
                    className="text-xs h-9"
                  >
                    <option value="all">All Shifts & Work Groups</option>
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        [{s.code}] {s.title} • {s.department} ({s.level})
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                    Department Filter
                  </label>
                  <Select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="text-xs h-9"
                  >
                    <option value="all">All Departments</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}
          </div>

          {/* Active Profile Info Banner (in Employee Mode) */}
          {viewMode === 'employee' && selectedProfile && (
            <div className="pt-2 border-t flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center space-x-3">
                <Avatar className="h-9 w-9 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-muted text-foreground font-semibold text-xs">
                    {selectedProfile.full_name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      {selectedProfile.full_name}
                    </h3>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {selectedProfile.employee_id ||
                        selectedProfile.matric_number ||
                        'Staff'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedProfile.department || 'General Team'} &bull;{' '}
                    {selectedProfile.designation ||
                      selectedProfile.level ||
                      'Employee'}
                  </p>
                </div>
              </div>

              {/* Quick Monthly Metric Badges */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  {monthlyStats.signedDays} Signed Days
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 text-rose-800 border border-rose-200 font-medium">
                  <XCircle className="w-3.5 h-3.5 text-rose-600" />
                  {monthlyStats.missedDays} Missed Days
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted text-foreground font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  {monthlyStats.rate}% Compliance
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Calendar Section */}
      <Card className="shadow-sm border">
        {/* Calendar Header with Navigation */}
        <CardHeader className="pb-4 border-b">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1 bg-muted/60 p-1 rounded-lg border">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrevMonth}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNextMonth}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Next Month"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold text-foreground tracking-tight">
                  {monthNames[month]} {year}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleJumpToToday}
                  className="h-7 text-xs px-2 text-muted-foreground"
                >
                  Today
                </Button>
              </div>
            </div>

            {/* Quick Month & Year jump selects */}
            <div className="flex items-center space-x-2">
              <select
                value={month}
                onChange={(e) => handleMonthSelect(Number(e.target.value))}
                className="text-xs bg-background border rounded-md px-2 py-1 text-foreground"
              >
                {monthNames.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => handleYearSelect(Number(e.target.value))}
                className="text-xs bg-background border rounded-md px-2 py-1 text-foreground"
              >
                {[year - 2, year - 1, year, year + 1, year + 2].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {loading ? (
            <div className="text-center py-24">
              <div className="inline-block animate-spin rounded-full h-9 w-9 border-2 border-primary border-t-transparent"></div>
              <p className="text-xs text-muted-foreground mt-3 font-medium">
                Computing attendance calendar status...
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Day-of-week Headers */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center text-xs font-semibold text-muted-foreground pb-2">
                {daysOfWeek.map((day, idx) => (
                  <div
                    key={day}
                    className={`py-1 rounded-md ${
                      idx === 0 || idx === 6 ? 'text-muted-foreground/70' : 'text-foreground'
                    }`}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* 7-column Calendar Grid */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
                {calendarDays.map((day, index) => {
                  const dayNum = day.date.getDate();

                  return (
                    <div
                      key={`${day.dateKey}-${index}`}
                      onClick={() => handleDayClick(day)}
                      className={`min-h-[86px] sm:min-h-[105px] p-2 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between relative group ${
                        !day.isCurrentMonth
                          ? 'bg-muted/15 opacity-40 border-dashed border-muted'
                          : day.isToday
                          ? 'bg-primary/5 border-primary/50 shadow-xs ring-1 ring-primary/20'
                          : 'bg-card hover:bg-muted/30 hover:border-foreground/20 hover:shadow-xs'
                      }`}
                    >
                      {/* Top Date Header */}
                      <div className="flex justify-between items-start">
                        <span
                          className={`text-xs font-bold leading-none ${
                            day.isToday
                              ? 'w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center'
                              : !day.isCurrentMonth
                              ? 'text-muted-foreground'
                              : 'text-foreground'
                          }`}
                        >
                          {dayNum}
                        </span>

                        {day.isToday && (
                          <span className="hidden sm:inline-block text-[9px] font-mono text-primary font-bold uppercase">
                            Today
                          </span>
                        )}
                      </div>

                      {/* Middle / Center Status Indicator */}
                      <div className="my-auto py-1 flex flex-col items-center justify-center">
                        {viewMode === 'employee' ? (
                          // Individual Staff View
                          !day.hasSessions ? (
                            <span className="text-[10px] text-muted-foreground/50 font-mono">
                              —
                            </span>
                          ) : day.status === 'signed' ? (
                            <div className="flex flex-col items-center group-hover:scale-105 transition-transform">
                              <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shadow-xs border border-emerald-200 dark:border-emerald-800">
                                <Check className="w-5 h-5 stroke-[2.75]" />
                              </div>
                              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                                Signed
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center group-hover:scale-105 transition-transform">
                              <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 flex items-center justify-center shadow-xs border border-rose-200 dark:border-rose-800">
                                <X className="w-5 h-5 stroke-[2.75]" />
                              </div>
                              <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 mt-1">
                                Missed
                              </span>
                            </div>
                          )
                        ) : (
                          // Shift Overview View
                          day.shiftSessions.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground/40 font-mono">
                              —
                            </span>
                          ) : (
                            <div className="w-full space-y-1">
                              <div className="flex items-center justify-between text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-200/70">
                                <span className="font-semibold flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" />
                                  {day.attendeesCount}
                                </span>
                                <span className="text-[9px]">Signed</span>
                              </div>
                              {day.totalEnrolledCount - day.attendeesCount > 0 && (
                                <div className="flex items-center justify-between text-[10px] bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 px-1.5 py-0.5 rounded border border-rose-200/70">
                                  <span className="font-semibold flex items-center gap-0.5">
                                    <X className="w-2.5 h-2.5" />
                                    {Math.max(
                                      0,
                                      day.totalEnrolledCount - day.attendeesCount
                                    )}
                                  </span>
                                  <span className="text-[9px]">Missed</span>
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </div>

                      {/* Bottom Footer Info */}
                      <div className="text-[10px] text-muted-foreground truncate">
                        {viewMode === 'employee' && day.hasSessions && (
                          <span className="text-[9px] text-muted-foreground flex items-center gap-1 truncate">
                            {day.signedSessions.length > 0
                              ? day.signedSessions[0].shift?.code ||
                                day.signedSessions[0].session.session_name
                              : day.missedSessions[0]?.shift?.code ||
                                day.missedSessions[0]?.session.session_name}
                          </span>
                        )}
                        {viewMode === 'shift' && day.shiftSessions.length > 0 && (
                          <span className="text-[9px] text-muted-foreground">
                            {day.shiftSessions.length} session
                            {day.shiftSessions.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend & Compliance Summary Footnote */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Visual Legend */}
        <Card className="shadow-xs border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Calendar Status Legend
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center border border-emerald-200">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
              <div>
                <span className="font-semibold text-foreground">
                  Signed Attendance
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Staff clocked in via Live QR, PIN, or Offline scan
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center border border-rose-200">
                <X className="w-3.5 h-3.5 stroke-[3]" />
              </div>
              <div>
                <span className="font-semibold text-foreground">
                  Missed Session
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Session took place for shift, but staff did not clock in
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center border">
                <span className="text-xs font-mono">—</span>
              </div>
              <div>
                <span className="font-semibold text-foreground">
                  No Session / Off Day
                </span>
                <p className="text-[11px] text-muted-foreground">
                  No check-in kiosk or shift session held
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Method Distribution (in Employee View) */}
        {viewMode === 'employee' && (
          <Card className="shadow-xs border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Clock-In Method Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center py-1 border-b">
                <span className="flex items-center gap-1.5 text-foreground">
                  <Badge variant="active" className="text-[9px] px-1.5 py-0">
                    QR
                  </Badge>
                  Live Kiosk Dynamic QR
                </span>
                <span className="font-semibold font-mono">
                  {monthlyStats.qrCount || 0} times
                </span>
              </div>

              <div className="flex justify-between items-center py-1 border-b">
                <span className="flex items-center gap-1.5 text-foreground">
                  <Badge variant="default" className="text-[9px] px-1.5 py-0">
                    PIN
                  </Badge>
                  Manual PIN Code Entry
                </span>
                <span className="font-semibold font-mono">
                  {monthlyStats.pinCount || 0} times
                </span>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="flex items-center gap-1.5 text-foreground">
                  <Badge variant="pending" className="text-[9px] px-1.5 py-0">
                    OFFLINE
                  </Badge>
                  Offline Cached QR
                </span>
                <span className="font-semibold font-mono">
                  {monthlyStats.offlineQrCount || 0} times
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Manager Guidance & Compliance Note */}
        <Card className="shadow-xs border md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Supervisor Compliance Note
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-2">
            <p>
              This calendar is restricted to managers and system administrators to
              audit punctuality and attendance compliance.
            </p>
            <p className="text-[11px] leading-relaxed">
              Click any calendar day to inspect detailed time stamps, verification
              methods, and digital signatures.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Interactive Day Breakdown Dialog */}
      <Dialog open={isDayDialogOpen} onOpenChange={setIsDayDialogOpen}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <CalendarIcon className="w-4 h-4 text-primary" />
              {selectedDayDetail &&
                selectedDayDetail.date.toLocaleDateString(undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {viewMode === 'employee'
                ? `Attendance breakdown for ${selectedProfile?.full_name || 'Staff'}`
                : `Shift attendance roster for ${selectedShift?.title || 'Selected Shift'}`}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {selectedDayDetail && (
              <>
                {viewMode === 'employee' ? (
                  // Individual Staff Day Details
                  !selectedDayDetail.hasSessions ? (
                    <div className="text-center py-8 border border-dashed rounded-xl bg-muted/20">
                      <CalendarIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-xs font-semibold text-foreground">
                        No Attendance Sessions Scheduled
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        No work shift sessions were held for this staff member on this day.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Signed Sessions List */}
                      {selectedDayDetail.signedSessions.map((s, idx) => (
                        <div
                          key={`signed-${idx}`}
                          className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-2"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                                <Check className="w-4 h-4 stroke-[3]" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-foreground">
                                  {s.session.session_name}
                                </h4>
                                <p className="text-[11px] text-muted-foreground">
                                  {s.shift?.code} &bull; {s.shift?.title}
                                </p>
                              </div>
                            </div>
                            <Badge variant="active" className="text-[10px]">
                              SIGNED / PRESENT
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200/60 text-xs">
                            <div>
                              <span className="text-[10px] text-muted-foreground block">
                                Clock-In Timestamp
                              </span>
                              <span className="font-semibold font-mono flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3 text-muted-foreground" />
                                {new Date(s.record.checked_in_at).toLocaleTimeString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground block">
                                Verification Method
                              </span>
                              <span className="font-semibold uppercase font-mono mt-0.5 block">
                                {s.record.check_in_method === 'qr'
                                  ? 'Live QR Scan'
                                  : s.record.check_in_method === 'pin'
                                  ? 'PIN Code Entry'
                                  : 'Offline QR Scan'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Missed Sessions List */}
                      {selectedDayDetail.missedSessions.map((m, idx) => (
                        <div
                          key={`missed-${idx}`}
                          className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 space-y-2"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center">
                                <X className="w-4 h-4 stroke-[3]" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-foreground">
                                  {m.session.session_name}
                                </h4>
                                <p className="text-[11px] text-muted-foreground">
                                  {m.shift?.code} &bull; {m.shift?.title}
                                </p>
                              </div>
                            </div>
                            <Badge variant="destructive" className="text-[10px]">
                              MISSED / ABSENT
                            </Badge>
                          </div>

                          <div className="pt-2 border-t border-rose-200/60 text-xs text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>
                              Session started at{' '}
                              {new Date(m.session.started_at).toLocaleTimeString()}{' '}
                              with no check-in recorded.
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  // Shift Roster Day Details
                  selectedDayDetail.shiftSessions.length === 0 ? (
                    <div className="text-center py-8 border border-dashed rounded-xl bg-muted/20">
                      <CalendarIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-xs font-semibold text-foreground">
                        No Kiosk Sessions
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        No check-in sessions were initiated for this shift on this date.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs pb-2 border-b">
                        <span className="font-semibold text-foreground">
                          Staff Roster Attendance ({selectedDayDetail.attendeesCount} /{' '}
                          {selectedDayDetail.totalEnrolledCount} Signed)
                        </span>
                        <Badge variant="subtle" className="font-mono text-[10px]">
                          {selectedDayDetail.totalEnrolledCount > 0
                            ? `${Math.round(
                                (selectedDayDetail.attendeesCount /
                                  selectedDayDetail.totalEnrolledCount) *
                                  100
                              )}% Present`
                            : 'N/A'}
                        </Badge>
                      </div>

                      <div className="divide-y max-h-72 overflow-y-auto">
                        {selectedDayDetail.roster.map((member) => (
                          <div
                            key={member.profile.id}
                            className="py-2.5 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center space-x-2.5">
                              <Avatar className="h-7 w-7 rounded-md">
                                <AvatarFallback className="rounded-md bg-muted text-[10px]">
                                  {member.profile.full_name
                                    .split(' ')
                                    .map((n) => n[0])
                                    .join('')
                                    .slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="text-xs font-medium text-foreground">
                                  {member.profile.full_name}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {member.profile.employee_id ||
                                    member.profile.email}
                                </div>
                              </div>
                            </div>

                            <div>
                              {member.signed ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                                  <Check className="w-3 h-3 stroke-[3]" />
                                  Signed{' '}
                                  {member.record &&
                                    `(${new Date(
                                      member.record.checked_in_at
                                    ).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })})`}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                                  <X className="w-3 h-3 stroke-[3]" />
                                  Missed
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper to construct day detail object
function buildDayDetail(
  date: Date,
  dateKey: string,
  isCurrentMonth: boolean,
  isToday: boolean,
  isFuture: boolean,
  allSessions: AttendanceSession[],
  allRecords: AttendanceRecord[],
  allRegistrations: Array<{ course_id: string; student_id: string }>,
  viewMode: 'employee' | 'shift',
  targetUserId: string,
  targetShiftId: string,
  shiftMap: Map<string, Shift>,
  profileMap: Map<string, Profile>
): DayAttendanceDetail {
  // Find all sessions on this day
  const sessionsOnDay = allSessions.filter((s) => {
    const sDate = new Date(s.started_at).toISOString().slice(0, 10);
    return sDate === dateKey;
  });

  if (viewMode === 'employee') {
    // Determine shifts this employee is enrolled in
    const userShiftIds = new Set(
      allRegistrations
        .filter((r) => r.student_id === targetUserId)
        .map((r) => r.course_id)
    );

    // Records by this user on this day
    const userRecords = allRecords.filter((r) => r.student_id === targetUserId);
    const userRecordMap = new Map<string, AttendanceRecord>();
    userRecords.forEach((r) => userRecordMap.set(r.session_id, r));

    // Sessions relevant to this user:
    // Either the session is for a shift they are registered in, OR they have a record for it
    const relevantSessions = sessionsOnDay.filter(
      (s) => userShiftIds.has(s.course_id) || userRecordMap.has(s.id)
    );

    const signedSessions: Array<{
      session: AttendanceSession;
      record: AttendanceRecord;
      shift?: Shift;
    }> = [];
    const missedSessions: Array<{
      session: AttendanceSession;
      shift?: Shift;
    }> = [];

    relevantSessions.forEach((sess) => {
      const rec = userRecordMap.get(sess.id);
      const shift = shiftMap.get(sess.course_id);
      if (rec) {
        signedSessions.push({ session: sess, record: rec, shift });
      } else {
        missedSessions.push({ session: sess, shift });
      }
    });

    const hasSessions = relevantSessions.length > 0;
    let status: 'signed' | 'missed' | 'none' = 'none';

    if (hasSessions) {
      if (signedSessions.length > 0) {
        status = 'signed';
      } else {
        status = 'missed';
      }
    }

    return {
      date,
      dateKey,
      isCurrentMonth,
      isToday,
      isFuture,
      hasSessions,
      status,
      signedSessions,
      missedSessions,
      shiftSessions: [],
      attendeesCount: 0,
      totalEnrolledCount: 0,
      roster: [],
    };
  } else {
    // Shift Overview
    const relevantShiftSessions =
      targetShiftId === 'all'
        ? sessionsOnDay
        : sessionsOnDay.filter((s) => s.course_id === targetShiftId);

    const relevantShiftIds = new Set(
      relevantShiftSessions.map((s) => s.course_id)
    );

    // Enrolled students in these shifts
    const enrolledStudentIds = Array.from(
      new Set(
        allRegistrations
          .filter((r) => relevantShiftIds.has(r.course_id))
          .map((r) => r.student_id)
      )
    );

    // Attendance records for these sessions
    const sessIds = new Set(relevantShiftSessions.map((s) => s.id));
    const relevantRecords = allRecords.filter((r) =>
      sessIds.has(r.session_id)
    );
    const signedStudentIds = new Set(
      relevantRecords.map((r) => r.student_id)
    );

    const roster: Array<{
      profile: Profile;
      signed: boolean;
      record?: AttendanceRecord;
    }> = enrolledStudentIds.map((studentId) => {
      const profile =
        profileMap.get(studentId) ||
        ({
          id: studentId,
          full_name: 'Employee',
          email: '',
          role: 'employee',
          created_at: '',
          updated_at: '',
          department: null,
          designation: null,
          employee_id: null,
          matric_number: null,
          notification_token: null,
          signature_url: null,
          level: null,
        } as Profile);

      const isSigned = signedStudentIds.has(studentId);
      const record = relevantRecords.find((r) => r.student_id === studentId);

      return {
        profile,
        signed: isSigned,
        record,
      };
    });

    return {
      date,
      dateKey,
      isCurrentMonth,
      isToday,
      isFuture,
      hasSessions: relevantShiftSessions.length > 0,
      signedSessions: [],
      missedSessions: [],
      shiftSessions: relevantShiftSessions,
      attendeesCount: signedStudentIds.size,
      totalEnrolledCount: enrolledStudentIds.length,
      roster,
    };
  }
}
