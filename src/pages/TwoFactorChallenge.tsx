import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authClient } from '@/lib/authClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Loader2, Shield, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

type ChallengeMode = 'totp' | 'recovery';

const TwoFactorChallenge = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ChallengeMode>('totp');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');

  const handleTOTPVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length < 6) {
      toast.error('Please enter the full 6-digit code');
      return;
    }
    setLoading(true);
    try {
      const result = await (authClient as any).twoFactor.verifyTotp({
        code: totpCode,
      });
      if (result?.error) {
        toast.error(result.error.message ?? 'Invalid code');
        setLoading(false);
        return;
      }
      navigate('/');
    } catch (err: any) {
      toast.error(err?.message ?? 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryCode.trim()) {
      toast.error('Please enter a recovery code');
      return;
    }
    setLoading(true);
    try {
      const result = await (authClient as any).twoFactor.verifyBackupCode({
        code: recoveryCode.trim(),
      });
      if (result?.error) {
        toast.error(result.error.message ?? 'Invalid recovery code');
        setLoading(false);
        return;
      }
      navigate('/');
    } catch (err: any) {
      toast.error(err?.message ?? 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'recovery') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 overflow-y-auto">
        <Card className="w-full max-w-md border-border shadow-lg my-auto">
          <CardHeader className="text-center">
            <div className="mx-auto bg-primary/10 p-4 rounded-full mb-3">
              <KeyRound className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-xl">Recovery Code</CardTitle>
            <CardDescription>
              Enter one of your recovery codes to sign in.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleRecoveryVerify}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recovery-code">Recovery Code</Label>
                <Input
                  id="recovery-code"
                  type="text"
                  placeholder="Enter recovery code"
                  value={recoveryCode}
                  onChange={e => setRecoveryCode(e.target.value)}
                  autoFocus
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button type="submit" className="w-full" disabled={loading || !recoveryCode.trim()}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setMode('totp')}
              >
                Use authenticator app instead
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 overflow-y-auto">
      <Card className="w-full max-w-md border-border shadow-lg my-auto">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary/10 p-4 rounded-full mb-3">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-xl">Two-Factor Authentication</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator app.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleTOTPVerify}>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={totpCode}
                onChange={setTotpCode}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button type="submit" className="w-full" disabled={loading || totpCode.length < 6}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setMode('recovery')}
            >
              Use a recovery code instead
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => navigate('/login')}
            >
              Back to sign in
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default TwoFactorChallenge;
