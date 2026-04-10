import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authClient } from '@/lib/authClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, Shield, CheckCircle2, Copy, ArrowRight, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { LoadingDialog } from '@/components/LoadingDialog';
import QRCode from 'qrcode';

type SetupStep = 'choose' | 'totp-scan' | 'totp-verify' | 'recovery' | 'done';

const TwoFactorSetup = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<SetupStep>('choose');
  const [totpURI, setTotpURI] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const qrGenerated = useRef(false);

  useEffect(() => {
    if (totpURI && !qrGenerated.current) {
      qrGenerated.current = true;
      QRCode.toDataURL(totpURI, { width: 200, margin: 2 }).then(setQrDataUrl).catch(() => {});
    }
  }, [totpURI]);

  const handleEnableTOTP = async () => {
    setLoading(true);
    try {
      const result = await (authClient as any).twoFactor.enable({
        password: undefined,
      });
      if (result?.error) {
        toast.error(result.error.message ?? 'Failed to enable 2FA');
        setLoading(false);
        return;
      }
      const data = result?.data;
      if (data?.totpURI) {
        setTotpURI(data.totpURI);
      }
      if (data?.backupCodes) {
        setBackupCodes(data.backupCodes);
      }
      setStep('totp-scan');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to set up 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyTOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyCode.length < 6) {
      toast.error('Please enter a 6-digit code');
      return;
    }
    setLoading(true);
    try {
      const result = await (authClient as any).twoFactor.verifyTotp({
        code: verifyCode,
      });
      if (result?.error) {
        toast.error(result.error.message ?? 'Invalid code');
        setLoading(false);
        return;
      }
      setStep('recovery');
    } catch (err: any) {
      toast.error(err?.message ?? 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    toast.success('Recovery codes copied to clipboard');
  };

  const handleFinish = () => {
    navigate('/');
  };

  if (step === 'choose') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 overflow-y-auto">
        <Card className="w-full max-w-md border-border shadow-lg my-auto">
          <CardHeader className="text-center">
            <div className="mx-auto bg-primary/10 p-4 rounded-full mb-3">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Set Up Two-Factor Authentication</CardTitle>
            <CardDescription>
              Add an extra layer of security to your account using an authenticator app.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-2 pt-2">
            <Button className="w-full" onClick={handleEnableTOTP} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Shield className="mr-2 h-4 w-4" />
              Set Up with Authenticator App
            </Button>
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (step === 'totp-scan') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 overflow-y-auto">
        <LoadingDialog open={loading} message="Setting up..." />
        <Card className="w-full max-w-md border-border shadow-lg my-auto">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Scan QR Code</CardTitle>
            <CardDescription>
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {qrDataUrl && (
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <img
                  src={qrDataUrl}
                  alt="TOTP QR Code"
                  className="w-48 h-48"
                />
              </div>
            )}
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2">Or enter this code manually:</p>
              <code className="text-xs bg-muted p-2 rounded block break-all select-all">
                {totpURI.match(/secret=([^&]+)/)?.[1] ?? ''}
              </code>
            </div>
            <form onSubmit={handleVerifyTOTP} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="totp-code">Enter the 6-digit code from your app</Label>
                <Input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={verifyCode}
                  onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || verifyCode.length < 6}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify Code
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'recovery') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 overflow-y-auto">
        <Card className="w-full max-w-md border-border shadow-lg my-auto">
          <CardHeader className="text-center">
            <div className="mx-auto bg-green-500/10 p-4 rounded-full mb-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle className="text-xl">Save Your Recovery Codes</CardTitle>
            <CardDescription>
              Store these codes in a safe place. You can use them to access your account if you lose your authenticator device.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted rounded-lg p-4 font-mono text-sm space-y-1">
              {backupCodes.map((code, i) => (
                <div key={i} className="text-center">{code}</div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={copyBackupCodes}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Recovery Codes
            </Button>
            <div className="space-y-2">
              <Label htmlFor="recovery-confirm" className="text-sm">
                Type the first recovery code to confirm you saved them
              </Label>
              <Input
                id="recovery-confirm"
                type="text"
                placeholder="Enter first recovery code"
                value={recoveryConfirm}
                onChange={e => setRecoveryConfirm(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              disabled={backupCodes.length > 0 && recoveryConfirm.trim() !== backupCodes[0]}
              onClick={() => setStep('done')}
            >
              I've Saved My Codes
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 overflow-y-auto">
      <Card className="w-full max-w-md border-border shadow-lg my-auto">
        <CardHeader className="text-center">
          <div className="mx-auto bg-green-500/10 p-4 rounded-full mb-3">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <CardTitle className="text-2xl">2FA Enabled!</CardTitle>
          <CardDescription>
            Your account is now protected with two-factor authentication.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button className="w-full" onClick={handleFinish}>
            Continue to App
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default TwoFactorSetup;
