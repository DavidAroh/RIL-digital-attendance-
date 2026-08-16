import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Calendar, Users, FileSpreadsheet, FileText } from 'lucide-react';
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Button } from '../ui/button';
import type { Database } from '../../lib/database.types';

type AttendanceSession =
  Database['public']['Tables']['attendance_sessions']['Row'];

interface SessionWithCount extends AttendanceSession {
  attendance_count: number;
}

interface SessionHistoryProps {
  shiftId: string;
}

export function SessionHistory({ shiftId }: SessionHistoryProps) {
  const [sessions, setSessions] = useState<SessionWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    const { data: sessionsData, error } = await supabase
      .from('attendance_sessions')
      .select('*')
      .eq('course_id', shiftId)
      .eq('is_active', false)
      .order('started_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching sessions:', error);
      setLoading(false);
      return;
    }

    const sessionsWithCounts = await Promise.all(
      (sessionsData || []).map(async (session) => {
        const { count } = await supabase
          .from('attendance_records')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', session.id);

        return {
          ...session,
          attendance_count: count || 0,
        };
      })
    );

    setSessions(sessionsWithCounts);
    setLoading(false);
  }, [shiftId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  type ExportRecord = {
    full_name: string;
    employee_id: string | null;
    check_in_method: Database['public']['Tables']['attendance_records']['Row']['check_in_method'];
    checked_in_at: string;
    signature_url: string | null;
  };

  const fetchSessionRecords = async (
    sessionId: string
  ): Promise<ExportRecord[]> => {
    const { data, error } = await supabase.rpc('get_attendees_for_session', {
      p_session_id: sessionId,
    });
    if (error) {
      console.error('Error fetching session records:', error);
      return [];
    }
    const rows = (data || []) as unknown as Array<{
      checked_in_at: string;
      check_in_method: ExportRecord['check_in_method'];
      full_name: string | null;
      employee_id: string | null;
      matric_number: string | null;
      signature_url: string | null;
      signature_name: string | null;
    }>;
    return rows.map((r) => ({
      full_name: r.full_name || 'Staff Member',
      employee_id: r.employee_id || r.matric_number || '—',
      check_in_method: r.check_in_method,
      checked_in_at: r.checked_in_at,
      signature_url:
        r.signature_url ||
        (r.signature_name
          ? supabase.storage
              .from('signatures')
              .getPublicUrl(r.signature_name).data.publicUrl
          : null),
    }));
  };

  const exportToExcel = async (session: SessionWithCount) => {
    setExporting(`excel-${session.id}`);
    try {
      const records = await fetchSessionRecords(session.id);
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Workplace Attendance');

      sheet.columns = [
        { header: 'Staff Member Name', key: 'full_name', width: 30 },
        { header: 'Check-In Method', key: 'check_in_method', width: 18 },
        { header: 'Clock-In Timestamp', key: 'checked_in_at', width: 26 },
        { header: 'Verification Status', key: 'status', width: 18 },
      ];

      // Style header row with plain zinc color
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF18181B' },
      };

      records.forEach((r) => {
        sheet.addRow({
          full_name: r.full_name,
          check_in_method: r.check_in_method.toUpperCase(),
          checked_in_at: new Date(r.checked_in_at).toLocaleString(),
          status: 'VERIFIED',
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance_${session.session_name.replace(
        /\s+/g,
        '_'
      )}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Error generating Excel file:', e);
    } finally {
      setExporting(null);
    }
  };

  const exportToPDF = async (session: SessionWithCount) => {
    setExporting(`pdf-${session.id}`);
    try {
      const records = await fetchSessionRecords(session.id);
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });

      // Clean monochrome Header
      doc.setFillColor(24, 24, 27);
      doc.rect(0, 0, doc.internal.pageSize.getWidth(), 55, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15);
      doc.text('OFFICE ATTENDANCE REPORT', 40, 34);

      doc.setTextColor(60, 60, 60);
      doc.setFontSize(10);
      doc.text(`Session: ${session.session_name}`, 40, 80);
      doc.text(
        `Date: ${new Date(session.started_at).toLocaleDateString()}`,
        40,
        95
      );
      doc.text(`Total Staff Present: ${records.length}`, 40, 110);

      let top = 140;
      const left = 40;

      // Table Header
      doc.setFillColor(244, 244, 245);
      doc.rect(
        left,
        top - 15,
        doc.internal.pageSize.getWidth() - 80,
        22,
        'F'
      );
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text('Employee Name', left + 10, top);
      doc.text('Check-In Method', left + 200, top);
      doc.text('Clock-In Time', left + 340, top);

      top += 20;

      records.forEach((r) => {
        if (top > doc.internal.pageSize.getHeight() - 60) {
          doc.addPage();
          top = 40;
        }

        doc.setTextColor(30, 30, 30);
        doc.setFontSize(9);
        doc.text(r.full_name, left + 10, top);
        doc.text(r.check_in_method.toUpperCase(), left + 200, top);
        doc.text(
          new Date(r.checked_in_at).toLocaleTimeString(),
          left + 340,
          top
        );

        top += 22;
      });

      doc.save(
        `attendance_report_${session.session_name.replace(/\s+/g, '_')}.pdf`
      );
    } catch (e) {
      console.error('Error generating PDF:', e);
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">
          Past Kiosk & Check-In Sessions
        </CardTitle>
        <CardDescription className="text-xs">
          View past session attendance records and export verification reports
        </CardDescription>
      </CardHeader>

      <CardContent>
        {sessions.length === 0 ? (
          <div className="text-center py-10 border border-dashed rounded-lg bg-muted/20 text-muted-foreground text-xs">
            <Calendar className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            No past attendance sessions for this work group yet.
          </div>
        ) : (
          <div className="divide-y">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/40 rounded-md px-2.5 transition-colors"
              >
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    {session.session_name}
                  </h4>
                  <div className="flex items-center space-x-3 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center">
                      <Calendar className="w-3.5 h-3.5 mr-1" />
                      {new Date(session.started_at).toLocaleDateString()}
                    </span>
                    <span>&bull;</span>
                    <span className="flex items-center">
                      <Users className="w-3.5 h-3.5 mr-1" />
                      {session.attendance_count} Staff Present
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToExcel(session)}
                    disabled={exporting !== null}
                    className="h-7 text-xs gap-1"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToPDF(session)}
                    disabled={exporting !== null}
                    className="h-7 text-xs gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
