import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authClient } from '@/lib/authClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Mail, Loader2, ArrowLeft } from 'lucide-react';

const VerifyEmail = () => {
  const navigate  = useNavigate();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Poll occasionally to check if the user has verified their email in another tab
    const interval = setInterval(async () => {
      setChecking(true);
      try {
        const { data } = await authClient.getSession();
        if (data?.session) navigate('/');
      } catch {
        // Network or session not ready — keep polling
      } finally {
        setChecking(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto bg-primary/10 p-4 rounded-full mb-4">
            <Mail className="h-10 w-10 text-primary" />
          </div>
          <CardTitle>Verify your Email</CardTitle>
          <CardDescription>
            We've sent a confirmation link to your email address. Please click the link to activate your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground h-5">
            {checking && <Loader2 className="h-3 w-3 animate-spin" />}
            Waiting for verification...
          </div>
          <p className="text-xs text-muted-foreground">
            Once verified, this page will automatically redirect, or you can go back and log in manually.
          </p>
          <Button variant="ghost" className="w-full" onClick={() => navigate('/login')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyEmail;
