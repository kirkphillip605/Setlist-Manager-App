import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { updateUserProfile } from '@/lib/authClient';
import { apiPatch } from '@/lib/apiFetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, User, CheckCircle2, Shield, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { LoadingDialog } from '@/components/LoadingDialog';

type OnboardingStep = 'name' | '2fa-prompt';

const OnboardingWizard = () => {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<OnboardingStep>('name');

  const [firstName, setFirstName]  = useState('');
  const [lastName,  setLastName]   = useState('');
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    if (profile?.first_name) setFirstName(profile.first_name);
    if (profile?.last_name)  setLastName(profile.last_name);
    if (profile?.first_name || profile?.last_name) { initializedRef.current = true; return; }

    if (user?.name && !initializedRef.current) {
      const parts = user.name.split(' ');
      if (parts.length >= 2) {
        setFirstName(parts[0] ?? '');
        setLastName(parts.slice(1).join(' ') ?? '');
        initializedRef.current = true;
      }
    }
  }, [profile, user]);

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('Please enter your first and last name');
      return;
    }
    setLoading(true);
    try {
      await updateUserProfile({
        name: `${firstName.trim()} ${lastName.trim()}`,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });

      await apiPatch('/api/users/me', {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });

      await refreshProfile();
      setStep('2fa-prompt');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip2FA = () => {
    navigate('/');
  };

  const handleSetup2FA = () => {
    navigate('/2fa-setup');
  };

  if (step === '2fa-prompt') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 overflow-y-auto">
        <Card className="w-full max-w-md border-border shadow-lg my-auto">
          <CardHeader className="text-center">
            <div className="mx-auto bg-primary/10 p-4 rounded-full mb-3">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Secure Your Account</CardTitle>
            <CardDescription>
              Add two-factor authentication for extra security. You can always set this up later in your profile settings.
            </CardDescription>
          </CardHeader>

          <CardFooter className="flex flex-col gap-2 pt-2">
            <Button className="w-full" onClick={handleSetup2FA}>
              <Shield className="mr-2 h-4 w-4" />
              Set Up 2FA
            </Button>
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={handleSkip2FA}>
              Skip for now
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 overflow-y-auto">
      <LoadingDialog open={loading} message="Saving profile..." />
      <Card className="w-full max-w-md border-border shadow-lg my-auto">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary/10 p-4 rounded-full mb-3">
            <User className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Welcome to SetlistPRO</CardTitle>
          <CardDescription>
            Just a couple of details to get you started.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleNameSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="first-name">First Name</Label>
              <Input
                id="first-name" placeholder="e.g. John"
                value={firstName} onChange={e => setFirstName(e.target.value)}
                autoFocus required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Last Name</Label>
              <Input
                id="last-name" placeholder="e.g. Smith"
                value={lastName} onChange={e => setLastName(e.target.value)}
                required
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-2 pt-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Save &amp; Continue
            </Button>
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={signOut}>
              Sign Out
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default OnboardingWizard;
