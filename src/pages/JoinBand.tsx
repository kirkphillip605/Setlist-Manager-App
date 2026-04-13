import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBand } from '@/context/BandContext';
import { joinBand } from '@/lib/api';
import { apiGet } from '@/lib/apiFetch';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Loader2, LogIn, Clock, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';

interface PendingRequest {
  id: string;
  bandId: string;
  bandName: string;
  createdAt: string;
}

const JoinBand = () => {
  const { refreshBands, setActiveBand } = useBand();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);

  const fetchPending = useCallback(async () => {
    try {
      const data = await apiGet<PendingRequest[]>('/api/bands/pending-requests');
      setPendingRequests(data ?? []);
    } catch {
      // silently fail
    } finally {
      setLoadingPending(false);
    }
  }, []);

  useEffect(() => {
    void fetchPending();
  }, [fetchPending]);

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
      setJoinCode('');
      void fetchPending();
    } catch (err: any) {
      toast.error(err?.message ?? 'Invalid join code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="container max-w-lg mx-auto p-4 space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="-ml-2">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Join Another Band</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Enter Join Code</CardTitle>
            <CardDescription>
              Ask a band manager for their 6-character join code.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <LogIn className="mr-2 h-4 w-4" />}
                Send Join Request
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Pending Requests */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Clock className="h-4 w-4" /> Your Pending Requests
          </h2>

          {loadingPending ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-6 bg-card border rounded-xl">
              No pending join requests.
            </div>
          ) : (
            <div className="bg-card border rounded-xl divide-y overflow-hidden">
              {pendingRequests.map(r => (
                <div key={r.id} className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{r.bandName}</p>
                    <p className="text-xs text-muted-foreground">
                      Requested {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" /> Pending
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
};

export default JoinBand;
