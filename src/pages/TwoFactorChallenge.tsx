import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { twoFactor } from '@/lib/authClient';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Loader2, Shield, KeyRound, Mail } from 'lucide-react';
import { toast } from 'sonner';

type ChallengeMode = 'totp' | 'email-otp' | 'recovery';

const TwoFactorChallenge = () => {
  const navigate = useNavigate();
  const { checkSession } = useAuth();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ChallengeMode>('totp');
  const [totpCode, setTotpCode] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');

  const lastEmailOtpSendTime = useRef<number>(0);
  const EMAIL_OTP_COOLDOWN_MS = 30000;

  const challengeId = sessionStorage.getItem('2fa_challenge_id');

  useEffect(() => {
    if (!challengeId) {
      navigate('/login', { replace: true });
    }
  }, [challengeId, navigate]);

  if (!challengeId) {
    return null;
  }

  const onVerifySuccess = async () => {
    sessionStorage.removeItem('2fa_challenge_id');
    await checkSession();
    navigate('/');
  };

  const handleTOTPVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length < 6) {
      toast.error('Please enter the full 6-digit code');
      return;
    }
    setLoading(true);
    try {
      const result = await twoFactor.verifyTotp({
        code: totpCode,
      });
      if (result?.error) {
        toast.error(result.error.message ?? 'Invalid code');
        setLoading(false);
        return;
      }
      await onVerifySuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const canSendEmailOtp = () => {
    return Date.now() - lastEmailOtpSendTime.current >= EMAIL_OTP_COOLDOWN_MS;
  };

  const handleSendEmailOtp = async () => {
    if (!canSendEmailOtp()) {
      toast.error('Please wait before requesting another code');
      return;
    }
    setLoading(true);
    try {
      const result = await twoFactor.sendOtp();
      if (result?.error) {
        toast.error(result.error.message ?? 'Failed to send code');
        setLoading(false);
        return;
      }
      lastEmailOtpSendTime.current = Date.now();
      setEmailOtpSent(true);
      toast.success('Verification code sent to your email');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailOtpCode.length < 6) {
      toast.error('Please enter the full code');
      return;
    }
    setLoading(true);
    try {
      const result = await twoFactor.verifyOtp({
        code: emailOtpCode,
      });
      if (result?.error) {
        toast.error(result.error.message ?? 'Invalid code');
        setLoading(false);
        return;
      }
      await onVerifySuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
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
      const result = await twoFactor.verifyBackupCode({
        code: recoveryCode.trim(),
      });
      if (result?.error) {
        toast.error(result.error.message ?? 'Invalid recovery code');
        setLoading(false);
        return;
      }
      await onVerifySuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'email-otp') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 overflow-y-auto">
        <Card className="w-full max-w-md border-border shadow-lg my-auto">
          <CardHeader className="text-center">
            <div className="mx-auto bg-primary/10 p-4 rounded-full mb-3">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-xl">Email Verification</CardTitle>
            <CardDescription>
              {emailOtpSent
                ? 'Enter the verification code sent to your email.'
                : 'We\'ll send a verification code to your email address.'}
            </CardDescription>
          </CardHeader>
          {!emailOtpSent ? (
            <CardFooter className="flex flex-col gap-2">
              <Button className="w-full" onClick={handleSendEmailOtp} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Mail className="mr-2 h-4 w-4" />
                Send Verification Code
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
          ) : (
            <form onSubmit={handleEmailOtpVerify}>
              <CardContent className="space-y-4">
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={emailOtpCode}
                    onChange={setEmailOtpCode}
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
                <Button type="submit" className="w-full" disabled={loading || emailOtpCode.length < 6}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  disabled={!canSendEmailOtp()}
                  onClick={() => {
                    if (!canSendEmailOtp()) {
                      toast.error('Please wait before requesting another code');
                      return;
                    }
                    setEmailOtpSent(false);
                    setEmailOtpCode('');
                    handleSendEmailOtp();
                  }}
                >
                  Resend code
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
          )}
        </Card>
      </div>
    );
  }

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
              onClick={() => setMode('email-otp')}
            >
              Get a code via email instead
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
              onClick={() => {
                sessionStorage.removeItem('2fa_challenge_id');
                navigate('/login');
              }}
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
