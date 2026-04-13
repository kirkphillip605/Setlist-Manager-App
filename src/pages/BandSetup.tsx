import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useBand } from '@/context/BandContext';
import { createBand, joinBand, getMyInvitations, acceptInvitation, declineInvitation } from '@/lib/api';
import type { BandInvitation } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Music2, Plus, LogIn, LogOut, Mail, Check, X } from 'lucide-react';
import { toast } from 'sonner';

const BandSetup = () => {
  const { signOut } = useAuth();
  const { refreshBands, setActiveBand } = useBand();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const urlJoinCode = searchParams.get('joinCode') ?? '';

  const [loading, setLoading]       = useState(false);
  const [bandName, setBandName]     = useState('');
  const [bandDesc, setBandDesc]     = useState('');

  const storedJoinCode = typeof window !== 'undefined'
    ? sessionStorage.getItem('pendingJoinCode') ?? ''
    : '';
  const initialJoinCode = urlJoinCode || storedJoinCode;
  const [joinCode, setJoinCode]     = useState(initialJoinCode);

  useEffect(() => {
    if (urlJoinCode) {
      sessionStorage.setItem('pendingJoinCode', urlJoinCode);
    }
  }, [urlJoinCode]);

  useEffect(() => {
    if (initialJoinCode) {
      sessionStorage.removeItem('pendingJoinCode');
    }
  }, []);
  const [invitations, setInvitations] = useState<BandInvitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [processingInvId, setProcessingInvId] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    setLoadingInvitations(true);
    try {
      const inv = await getMyInvitations();
      setInvitations(inv ?? []);
    } catch {
      // silent
    } finally {
      setLoadingInvitations(false);
    }
  }, []);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  const handleAcceptInvitation = async (inv: BandInvitation) => {
    setProcessingInvId(inv.id);
    try {
      const result = await acceptInvitation(inv.id);
      await refreshBands();
      setActiveBand(result.bandId);
      toast.success(`Joined ${inv.band_name ?? 'band'} successfully!`);
      navigate('/');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to accept invitation');
    } finally {
      setProcessingInvId(null);
    }
  };

  const handleDeclineInvitation = async (inv: BandInvitation) => {
    setProcessingInvId(inv.id);
    try {
      await declineInvitation(inv.id);
      toast.success('Invitation declined');
      setInvitations(prev => prev.filter(i => i.id !== inv.id));
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to decline invitation');
    } finally {
      setProcessingInvId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bandName.trim()) { toast.error('Band name is required'); return; }
    setLoading(true);
    try {
      const band = await createBand(bandName.trim(), bandDesc.trim() || undefined);
      await refreshBands();
      setActiveBand(band.id);
      toast.success(`Band "${band.name}" created!`);
      navigate('/');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to create band');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { toast.error('Join code must be 6 characters'); return; }
    setLoading(true);
    try {
      const result = await joinBand(code);
      await refreshBands();
      setActiveBand(result.bandId);
      toast.success('Join request sent — waiting for approval.');
      navigate('/pending');
    } catch (err: any) {
      toast.error(err?.message ?? 'Invalid join code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary/10 p-4 rounded-full mb-3">
            <Music2 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Set Up Your Band</CardTitle>
          <CardDescription>
            Create a new band or join an existing one with a code.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue={initialJoinCode ? 'join' : 'create'}>
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="create">
                <Plus className="h-4 w-4 mr-2" />
                Create Band
              </TabsTrigger>
              <TabsTrigger value="join">
                <LogIn className="h-4 w-4 mr-2" />
                Join Band
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create">
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="band-name">Band Name *</Label>
                  <Input
                    id="band-name"
                    placeholder="e.g. The Electric Dreamers"
                    value={bandName}
                    onChange={e => setBandName(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="band-desc">Description (optional)</Label>
                  <Input
                    id="band-desc"
                    placeholder="Genre, style, or a short bio"
                    value={bandDesc}
                    onChange={e => setBandDesc(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Plus className="mr-2 h-4 w-4" />}
                  Create Band
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="join">
              <form onSubmit={handleJoin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="join-code">6-Character Join Code</Label>
                  <Input
                    id="join-code"
                    placeholder="e.g. AB12CD"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="font-mono text-center text-lg tracking-widest uppercase"
                    autoFocus
                    required
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    Ask your band manager for the join code.
                    Your request will need approval before you can access band data.
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <LogIn className="mr-2 h-4 w-4" />}
                  Send Join Request
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Incoming Invitations */}
          {loadingInvitations ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : invitations.length > 0 ? (
            <div className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Mail className="h-4 w-4" /> Pending Invitations
              </h3>
              <div className="border rounded-lg divide-y overflow-hidden">
                {invitations.map(inv => (
                  <div key={inv.id} className="p-3 space-y-2">
                    <div>
                      <p className="font-medium text-sm">{inv.band_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Invited by {inv.inviter_name}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleAcceptInvitation(inv)}
                        disabled={processingInvId === inv.id}
                      >
                        {processingInvId === inv.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <Check className="h-3.5 w-3.5 mr-1" />
                        )}
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeclineInvitation(inv)}
                        disabled={processingInvId === inv.id}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>

        <CardFooter>
          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default BandSetup;
