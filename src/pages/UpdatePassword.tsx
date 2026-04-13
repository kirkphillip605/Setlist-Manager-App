import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { resetUserPassword } from '@/lib/authClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, AlertTriangle } from 'lucide-react';

const UpdatePassword = () => {
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading]           = useState(false);

  const token = searchParams.get('token');

  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setTokenError('Invalid or missing reset link. Please request a new password reset.');
    }
  }, [token]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error('Missing reset token. Please request a new password reset link.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setLoading(true);

    const result = await resetUserPassword({ newPassword: password, token });
    const error = result?.error;

    if (error) {
      const msg = error.message ?? 'Failed to update password';
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('invalid')) {
        setTokenError('This reset link has expired or is invalid. Please request a new one.');
      }
      toast.error(msg);
    } else {
      toast.success('Password updated successfully! You can now sign in.');
      navigate('/login');
    }
    setLoading(false);
  };

  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto bg-destructive/10 p-4 rounded-full mb-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>Invalid Reset Link</CardTitle>
            <CardDescription>{tokenError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/login')}>
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set New Password</CardTitle>
          <CardDescription>Enter your new password below.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password" type="password"
                value={password} onChange={e => setPassword(e.target.value)}
                required minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password" type="password"
                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                required minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default UpdatePassword;
