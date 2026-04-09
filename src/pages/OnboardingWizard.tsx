import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { apiPatch } from '@/lib/apiFetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, User, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { LoadingDialog } from '@/components/LoadingDialog';

const OnboardingWizard = () => {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [firstName, setFirstName]  = useState('');
  const [lastName,  setLastName]   = useState('');
  const initializedRef = useRef(false);

  // Pre-fill from profile or OAuth metadata (runs once)
  useEffect(() => {
    if (initializedRef.current) return;
    if (profile?.first_name) setFirstName(profile.first_name);
    if (profile?.last_name)  setLastName(profile.last_name);
    if (profile?.first_name || profile?.last_name) { initializedRef.current = true; return; }

    // Try Google OAuth metadata
    const meta = (user as any)?.user_metadata ?? {};
    if (meta.full_name) {
      const parts = meta.full_name.split(' ');
      setFirstName(parts[0] ?? '');
      setLastName(parts.slice(1).join(' ') ?? '');
      initializedRef.current = true;
    } else if (meta.given_name) {
      setFirstName(meta.given_name  ?? '');
      setLastName(meta.family_name  ?? '');
      initializedRef.current = true;
    }
  }, [profile, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('Please enter your first and last name');
      return;
    }
    setLoading(true);
    try {
      await apiPatch('/api/users/me', { first_name: firstName.trim(), last_name: lastName.trim() });
      await refreshProfile();
      navigate('/');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

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

        <form onSubmit={handleSubmit}>
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
