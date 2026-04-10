import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authClient } from '@/lib/authClient';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { toast } from 'sonner';
import { Loader2, Mail, KeyRound, Wand2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { storageAdapter } from '@/lib/storageAdapter';
import { useTheme } from '@/components/theme-provider';
import { LoadingDialog } from '@/components/LoadingDialog';
import { CachedImage } from '@/components/CachedImage';

type SignInMethod = 'password' | 'magic-link' | 'email-otp';

const Login = () => {
  const navigate      = useNavigate();
  const { theme }     = useTheme();
  const [loading, setLoading]         = useState(false);
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [rememberMe, setRememberMe]   = useState(false);
  const [isDarkMode, setIsDarkMode]   = useState(false);
  const [resetEmail, setResetEmail]   = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);

  const [signInMethod, setSignInMethod] = useState<SignInMethod>('password');
  const [otpSent, setOtpSent]           = useState(false);
  const [otpValue, setOtpValue]         = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.user) navigate('/');
    });
  }, [navigate]);

  useEffect(() => {
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      setIsDarkMode(mq.matches);
      const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      setIsDarkMode(theme === 'dark');
    }
  }, [theme]);

  useEffect(() => {
    storageAdapter.getItem('login_email').then(saved => {
      if (saved) { setEmail(saved); setRememberMe(true); }
    });
  }, []);

  const logoSrc = isDarkMode
    ? '/setlist-logo-dark.png'
    : '/setlist-logo-transparent.png';

  const getCallbackUrl = () =>
    Capacitor.isNativePlatform()
      ? 'com.kirknetllc.setlistpro://auth/callback'
      : `${window.location.origin}/auth/callback`;

  const persistEmail = async () => {
    if (rememberMe) {
      await storageAdapter.setItem('login_email', email);
    } else {
      await storageAdapter.removeItem('login_email');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await persistEmail();

    const result = await authClient.signIn.email({ email: email.trim(), password });
    if (result.error) {
      const msg = result.error.message ?? '';
      if (msg.toLowerCase().includes('two factor') || msg.toLowerCase().includes('2fa') || (result.error as any).code === 'TWO_FACTOR_REQUIRED') {
        navigate('/2fa-challenge');
      } else {
        toast.error(msg || 'Sign in failed');
      }
    } else {
      if ((result.data as any)?.twoFactorRedirect) {
        navigate('/2fa-challenge');
      } else {
        navigate('/');
      }
    }
    setLoading(false);
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { toast.error('Please enter your email'); return; }
    setLoading(true);
    await persistEmail();

    try {
      const { error } = await authClient.signIn.magicLink({
        email: email.trim(),
        callbackURL: getCallbackUrl(),
      });
      if (error) throw new Error(error.message ?? 'Failed to send magic link');
      setMagicLinkSent(true);
      toast.success('Magic link sent! Check your email.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send magic link');
    }
    setLoading(false);
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { toast.error('Please enter your email'); return; }
    setLoading(true);
    await persistEmail();

    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: 'sign-in',
      });
      if (error) throw new Error(error.message ?? 'Failed to send code');
      setOtpSent(true);
      toast.success('Verification code sent to your email!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send code');
    }
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpValue.length < 6) { toast.error('Please enter the full code'); return; }
    setLoading(true);

    try {
      const result = await authClient.signIn.emailOtp({
        email: email.trim(),
        otp: otpValue,
      });
      if (result.error) throw new Error(result.error.message ?? 'Invalid code');
      if ((result.data as any)?.twoFactorRedirect) {
        navigate('/2fa-challenge');
      } else {
        navigate('/');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    }
    setLoading(false);
  };

  const [activeTab, setActiveTab] = useState<string>('login');
  const [convergenceEmail, setConvergenceEmail] = useState<string | null>(null);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await authClient.signUp.email({
      email:     email.trim(),
      password,
      name:      email.trim(),
      callbackURL: getCallbackUrl(),
      fetchOptions: {
        onSuccess: () => {
          toast.success('Check your email to confirm your account!');
          navigate('/verify-email');
        },
      },
    } as any);

    if (error) {
      const msg = error.message ?? '';
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists') || error.status === 409) {
        setConvergenceEmail(email.trim());
        setActiveTab('login');
        toast.info('An account with this email already exists. Please sign in instead.');
      } else {
        toast.error(msg || 'Sign up failed');
      }
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    await authClient.signIn.social({
      provider:    'google',
      callbackURL: getCallbackUrl(),
    });
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;
    setResetLoading(true);

    try {
      const { error } = await authClient.forgetPassword({
        email: resetEmail.trim(),
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) throw new Error(error.message ?? 'Request failed');
      toast.success('Password reset link sent!');
      setIsResetOpen(false);
      setResetEmail('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reset email');
    }
    setResetLoading(false);
  };

  const resetSignInState = () => {
    setOtpSent(false);
    setOtpValue('');
    setMagicLinkSent(false);
  };

  const renderSignInMethodSelector = () => (
    <div className="flex gap-1 mb-4">
      <Button
        variant={signInMethod === 'password' ? 'default' : 'outline'}
        size="sm"
        className="flex-1 text-xs"
        type="button"
        onClick={() => { setSignInMethod('password'); resetSignInState(); }}
      >
        <KeyRound className="mr-1 h-3 w-3" />
        Password
      </Button>
      <Button
        variant={signInMethod === 'magic-link' ? 'default' : 'outline'}
        size="sm"
        className="flex-1 text-xs"
        type="button"
        onClick={() => { setSignInMethod('magic-link'); resetSignInState(); }}
      >
        <Wand2 className="mr-1 h-3 w-3" />
        Magic Link
      </Button>
      <Button
        variant={signInMethod === 'email-otp' ? 'default' : 'outline'}
        size="sm"
        className="flex-1 text-xs"
        type="button"
        onClick={() => { setSignInMethod('email-otp'); resetSignInState(); }}
      >
        <Mail className="mr-1 h-3 w-3" />
        Email Code
      </Button>
    </div>
  );

  const renderPasswordForm = () => (
    <form onSubmit={handleLogin} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email-login">Email</Label>
        <Input
          id="email-login" type="email" placeholder="band@example.com"
          value={email} onChange={e => setEmail(e.target.value)}
          required autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password-login">Password</Label>
        <Input
          id="password-login" type="password"
          value={password} onChange={e => setPassword(e.target.value)}
          required autoComplete="current-password"
        />
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="remember" checked={rememberMe} onCheckedChange={c => setRememberMe(!!c)} />
        <Label htmlFor="remember" className="text-sm font-normal leading-none cursor-pointer">
          Remember email
        </Label>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Sign In
      </Button>
    </form>
  );

  const renderMagicLinkForm = () => (
    <form onSubmit={handleMagicLink} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email-magic">Email</Label>
        <Input
          id="email-magic" type="email" placeholder="band@example.com"
          value={email} onChange={e => setEmail(e.target.value)}
          required autoComplete="email"
        />
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox id="remember-magic" checked={rememberMe} onCheckedChange={c => setRememberMe(!!c)} />
        <Label htmlFor="remember-magic" className="text-sm font-normal leading-none cursor-pointer">
          Remember email
        </Label>
      </div>
      {magicLinkSent ? (
        <div className="text-center space-y-3">
          <div className="p-3 rounded-lg bg-muted">
            <Mail className="h-8 w-8 mx-auto mb-2 text-primary" />
            <p className="text-sm font-medium">Check your email!</p>
            <p className="text-xs text-muted-foreground mt-1">
              We sent a magic link to <strong>{email}</strong>
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setMagicLinkSent(false)}
          >
            Send again
          </Button>
        </div>
      ) : (
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send Magic Link
        </Button>
      )}
    </form>
  );

  const renderEmailOtpForm = () => (
    <>
      {!otpSent ? (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email-otp">Email</Label>
            <Input
              id="email-otp" type="email" placeholder="band@example.com"
              value={email} onChange={e => setEmail(e.target.value)}
              required autoComplete="email"
            />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="remember-otp" checked={rememberMe} onCheckedChange={c => setRememberMe(!!c)} />
            <Label htmlFor="remember-otp" className="text-sm font-normal leading-none cursor-pointer">
              Remember email
            </Label>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send Code
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code sent to <strong>{email}</strong>
            </p>
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={otpValue}
                onChange={setOtpValue}
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
          </div>
          <Button type="submit" className="w-full" disabled={loading || otpValue.length < 6}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify & Sign In
          </Button>
          <div className="flex justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => { setOtpSent(false); setOtpValue(''); }}
            >
              Change email
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  await authClient.emailOtp.sendVerificationOtp({
                    email: email.trim(),
                    type: 'sign-in',
                  });
                  toast.success('New code sent!');
                  setOtpValue('');
                } catch {
                  toast.error('Failed to resend code');
                }
                setLoading(false);
              }}
            >
              Resend code
            </Button>
          </div>
        </form>
      )}
    </>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 overflow-y-auto">
      <LoadingDialog open={loading} message="Authenticating..." />
      <Card className="w-full max-w-md border-border shadow-lg my-auto">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-2 h-16">
            <CachedImage
              src={logoSrc}
              alt="Setlist Manager Pro"
              className="h-16 object-contain"
              fallbackSrc="/setlist-icon.png"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setConvergenceEmail(null); }} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4 h-9">
              <TabsTrigger value="login"    className="text-xs">Sign In</TabsTrigger>
              <TabsTrigger value="register" className="text-xs">Create Account</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              {convergenceEmail && (
                <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-center">
                  <p className="font-medium">Account found for {convergenceEmail}</p>
                  <p className="text-xs text-muted-foreground mt-1">Choose a sign-in method below.</p>
                </div>
              )}
              {renderSignInMethodSelector()}

              {signInMethod === 'password' && renderPasswordForm()}
              {signInMethod === 'magic-link' && renderMagicLinkForm()}
              {signInMethod === 'email-otp' && renderEmailOtpForm()}

              {signInMethod === 'password' && (
                <div className="text-center mt-4">
                  <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
                    <DialogTrigger asChild>
                      <Button variant="link" type="button" className="px-0 h-auto text-xs font-normal text-muted-foreground">
                        Forgot password?
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Reset Password</DialogTitle>
                        <DialogDescription>
                          Enter your email and we'll send a reset link.
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleForgotPassword} className="space-y-4 py-2">
                        <div className="space-y-2">
                          <Label htmlFor="reset-email">Email</Label>
                          <Input
                            id="reset-email" type="email"
                            value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                            required autoComplete="email"
                          />
                        </div>
                        <DialogFooter>
                          <Button type="submit" disabled={resetLoading}>
                            {resetLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Send Reset Link
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-register">Email</Label>
                  <Input
                    id="email-register" type="email" placeholder="band@example.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    required autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-register">Password</Label>
                  <Input
                    id="password-register" type="password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    required autoComplete="new-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Account
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Button variant="outline" type="button" className="w-full" onClick={handleGoogleLogin}>
            <svg className="mr-2 h-4 w-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
              <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"/>
            </svg>
            Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
