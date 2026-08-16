import { useState } from 'react';
import { AuthProvider } from './contexts/AuthProvider';
import { useAuth } from './contexts/AuthContext';
import { LoginForm } from './components/Auth/LoginForm';
import { SignUpForm } from './components/Auth/SignUpForm';
import { ResetPasswordForm } from './components/Auth/ResetPasswordForm';
import { EmployeeDashboard } from './components/Employee/EmployeeDashboard';
import { ManagerDashboard } from './components/Manager/ManagerDashboard';
import { AdminDashboard } from './components/Admin/AdminDashboard';
import { Building2 } from 'lucide-react';
import { Badge } from './components/ui/badge';

function AuthenticatedApp() {
  const { profile, loading, passwordRecovery } = useAuth();
  const isResetRoute =
    typeof window !== 'undefined' &&
    (window.location.pathname === '/reset' ||
      (window.location.hash || '').startsWith('#reset'));

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
        <p className="text-sm text-muted-foreground mt-4 font-medium">
          Loading organization workspace...
        </p>
      </div>
    );
  }

  if (passwordRecovery || isResetRoute) {
    return <ResetPasswordForm />;
  }

  if (!profile) {
    return <AuthScreen />;
  }

  switch (profile.role) {
    case 'employee':
    case 'student' as unknown:
      return <EmployeeDashboard />;
    case 'manager':
    case 'lecturer' as unknown:
      return <ManagerDashboard />;
    case 'admin':
      return <AdminDashboard />;
    default:
      return <EmployeeDashboard />;
  }
}

function AuthScreen() {
  const [showSignUp, setShowSignUp] = useState(false);
  const { passwordRecovery } = useAuth();
  const isResetRoute =
    typeof window !== 'undefined' &&
    (window.location.pathname === '/reset' ||
      (window.location.hash || '').startsWith('#reset'));

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md py-8">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground mb-4 shadow-sm">
            <Building2 className="w-6 h-6" />
          </div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Workforce Attendance
            </h1>
            <Badge variant="subtle" className="text-[10px] uppercase font-mono">
              Enterprise
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-sm">
            Workplace attendance, QR check-in kiosks, and shift compliance management
          </p>
        </div>

        {passwordRecovery || isResetRoute ? (
          <ResetPasswordForm />
        ) : showSignUp ? (
          <SignUpForm onToggle={() => setShowSignUp(false)} />
        ) : (
          <LoginForm onToggle={() => setShowSignUp(true)} />
        )}

        <p className="text-xs text-center text-muted-foreground mt-8">
          Secured with Supabase Identity &bull; Role-Based Access Control
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}

export default App;
