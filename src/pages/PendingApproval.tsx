import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShieldAlert, Loader2, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PendingApproval = () => {
  const { profile, refreshProfile, signOut, user } = useAuth();
  const navigate = useNavigate();

  // Poll for profile changes (approval) every 30 seconds
  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(() => { void refreshProfile(); }, 30_000);
    return () => clearInterval(interval);
  }, [user?.id, refreshProfile]);

  // In the new multi-tenant system, "approval" is band-level, not platform-level.
  // This page redirects home immediately since there's no global approval gate.
  useEffect(() => {
    if (profile?.is_active) navigate('/');
  }, [profile, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto bg-amber-100 p-4 rounded-full mb-4">
            <ShieldAlert className="h-10 w-10 text-amber-600" />
          </div>
          <CardTitle>Account Pending</CardTitle>
          <CardDescription>
            Your account is being set up. This should only take a moment. Please wait or sign out and try again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground animate-pulse">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking status...
          </div>
          <Button variant="outline" className="w-full" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingApproval;
