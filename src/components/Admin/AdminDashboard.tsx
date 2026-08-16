import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Shield, Users, Building2, BarChart3, LogOut } from 'lucide-react';
import { UserManagement } from './UserManagement';
import { ShiftManagement } from './ShiftManagement';
import { Analytics } from './Analytics';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';

export function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const [view, setView] = useState<'users' | 'shifts' | 'analytics'>('users');

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Top Header */}
      <header className="bg-background border-b sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Avatar className="h-9 w-9 rounded-lg">
                <AvatarFallback className="rounded-lg bg-primary text-primary-foreground font-semibold">
                  <Shield className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-sm font-semibold text-foreground leading-none">
                    Administration Portal
                  </h1>
                  <Badge variant="subtle" className="text-[10px]">
                    HR & System Admin
                  </Badge>
                </div>
                <div className="flex items-center space-x-2 text-xs text-muted-foreground mt-1">
                  <span className="font-medium text-foreground">{profile?.full_name}</span>
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="h-8 gap-1.5 text-xs"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-background border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <Tabs
            value={view}
            onValueChange={(val) => setView(val as 'users' | 'shifts' | 'analytics')}
          >
            <TabsList className="bg-muted/60">
              <TabsTrigger value="users" className="gap-2 text-xs">
                <Users className="w-3.5 h-3.5" />
                Staff Directory
              </TabsTrigger>
              <TabsTrigger value="shifts" className="gap-2 text-xs">
                <Building2 className="w-3.5 h-3.5" />
                Shifts & Work Groups
              </TabsTrigger>
              <TabsTrigger value="analytics" className="gap-2 text-xs">
                <BarChart3 className="w-3.5 h-3.5" />
                Workplace Analytics
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {view === 'users' && <UserManagement />}
        {view === 'shifts' && <ShiftManagement />}
        {view === 'analytics' && <Analytics />}
      </main>
    </div>
  );
}
