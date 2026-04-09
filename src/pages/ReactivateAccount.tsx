import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiPost } from '@/lib/apiFetch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, UserX, LogOut, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const ReactivateAccount = () => {
  const { user, signOut, refreshProfile } = useAuth();
  const navigate  = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleReactivate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await apiPost('/api/users/me/reactivate');
      toast.success('Account reactivated! Welcome back.');
      await refreshProfile();
      navigate('/');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to reactivate account. Please contact support.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto bg-muted p-4 rounded-full mb-4">
            <UserX className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle>Account Inactive</CardTitle>
          <CardDescription>
            This account has been deactivated. You can request reactivation or sign out.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button className="w-full" onClick={handleReactivate} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <RefreshCw className="mr-2 h-4 w-4" />
            Reactivate My Account
          </Button>
          <Button variant="ghost" className="w-full" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Cancel & Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReactivateAccount;
