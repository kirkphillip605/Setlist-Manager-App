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
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { storageAdapter } from '@/lib/storageAdapter';
import { useTheme } from '@/components/theme-provider';
import { LoadingDialog } from '@/components/LoadingDialog';
import { CachedImage } from '@/components/CachedImage';

const Login = () => {
  const navigate      = useNavigate();
  const { theme }     = useTheme();
  const [loading, setLoading]         = useState(false);
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [firstName, setFirstName]     = useState('');
  const [lastName, setLastName]       = useState('');
  const [rememberMe, setRememberMe]   = useState(false);
  const [isDarkMode, setIsDarkMode]   = useState(false);
  const [resetEmail, setResetEmail]   = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);

  const { data: sessionData } = authClient.useSession();

  // Redirect if already logged in
  useEffect(() => {
    if (sessionData?.user) navigate('/');
  }, [sessionData, navigate]);

  // Dark mode detection
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

  // Restore remembered email
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

  // ── Sign In ───────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (rememberMe) {
      await storageAdapter.setItem('login_email', email);
    } else {
      await storageAdapter.removeItem('login_email');
    }

    const { error } = await authClient.signIn.email({ email: email.trim(), password });

    if (error) {
      toast.error(error.message ?? 'Sign in failed');
    } else {
      navigate('/');
    }
    setLoading(false);
  };

  // ── Sign Up ───────────────────────────────────────────────────
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const name = [firstName, lastName].filter(Boolean).join(' ') || email;
    const { error } = await authClient.signUp.email({
      email:     email.trim(),
      password,
      name,
      callbackURL: getCallbackUrl(),
      fetchOptions: {
        onSuccess: () => {
          toast.success('Check your email to confirm your account!');
          navigate('/verify-email');
        },
      },
    } as any);

    if (error) toast.error(error.message ?? 'Sign up failed');
    setLoading(false);
  };

  // ── Google OAuth ──────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    await authClient.signIn.social({
      provider:    'google',
      callbackURL: getCallbackUrl(),
    });
  };

  // ── Password Reset ────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;
    setResetLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/request-password-reset`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail.trim(),
          redirectTo: `${window.location.origin}/update-password`,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? `Request failed (${res.status})`);
      }
      toast.success('Password reset link sent!');
      setIsResetOpen(false);
      setResetEmail('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reset email');
    }
    setResetLoading(false);
  };

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
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4 h-9">
              <TabsTrigger value="login"    className="text-xs">Sign In</TabsTrigger>
              <TabsTrigger value="register" className="text-xs">Create Account</TabsTrigger>
            </TabsList>

            {/* ── Sign In Tab ── */}
            <TabsContent value="login">
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
                <Button type="submit" className="w-full" disabled={loading}>Sign In</Button>
              </form>

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
            </TabsContent>

            {/* ── Register Tab ── */}
            <TabsContent value="register">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="first-name">First Name</Label>
                    <Input
                      id="first-name" type="text" placeholder="Jane"
                      value={firstName} onChange={e => setFirstName(e.target.value)}
                      autoComplete="given-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last-name">Last Name</Label>
                    <Input
                      id="last-name" type="text" placeholder="Smith"
                      value={lastName} onChange={e => setLastName(e.target.value)}
                      autoComplete="family-name"
                    />
                  </div>
                </div>
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
