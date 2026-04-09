import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Users, Crown, Radio, Smartphone, CloudOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useBand } from '@/context/BandContext';
import { createGigSession, getGigSession, joinGigSession } from '@/lib/api';
import { toast } from 'sonner';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

interface PerformanceSessionDialogProps {
  open:     boolean;
  gigId:    string | null;
  gigName:  string;
  onClose:  () => void;
  onJoin:   (mode: 'leader' | 'follower' | 'standalone', sessionId: string) => void;
}

export const PerformanceSessionDialog = ({ open, gigId, gigName, onClose, onJoin }: PerformanceSessionDialogProps) => {
  const { user } = useAuth();
  const { activeBandId } = useBand();
  const isOnline = useNetworkStatus();

  const [loading, setLoading]               = useState(true);
  const [existingSession, setExistingSession] = useState<any>(null);
  const [leaderName, setLeaderName]         = useState('');

  useEffect(() => {
    if (open && gigId && isOnline) {
      checkSession();
    } else if (!isOnline) {
      setLoading(false);
    }
  }, [open, gigId, isOnline]);

  const checkSession = async () => {
    if (!gigId || !activeBandId || !user?.id) return;
    setLoading(true);
    try {
      const session = await getGigSession(activeBandId, gigId);

      if (session && session.is_active) {
        // Auto-resume if we're the leader
        if (session.leader_id === user.id) {
          toast.success('Welcome back! Resuming session as Leader.');
          onJoin('leader', session.id);
          return;
        }

        // Auto-resume if we're already a participant
        if (session.participant_ids?.includes(user.id)) {
          toast.success('Resuming session connection...');
          await joinGigSession(activeBandId, session.id);
          onJoin('follower', session.id);
          return;
        }

        // Show "join" UI
        setExistingSession(session);
        // Leader name comes from the session response if the server populates it
        setLeaderName(session.leader_name ?? 'Leader');
      } else {
        setExistingSession(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleStartAsLeader = async () => {
    if (!user || !gigId || !activeBandId) return;
    setLoading(true);
    try {
      let sessionId: string;
      if (existingSession) {
        sessionId = existingSession.id;
      } else {
        const newSession = await createGigSession(activeBandId, gigId, user.id);
        sessionId = newSession.id;
      }
      await joinGigSession(activeBandId, sessionId);
      onJoin('leader', sessionId);
    } catch (e: any) {
      toast.error('Failed to start session: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinAsFollower = async () => {
    if (!user || !existingSession || !activeBandId) return;
    setLoading(true);
    try {
      await joinGigSession(activeBandId, existingSession.id);
      onJoin('follower', existingSession.id);
    } catch (e: any) {
      toast.error('Failed to join session: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStandalone = () => { onJoin('standalone', ''); };

  return (
    <Dialog open={open} onOpenChange={val => !val && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start Performance: {gigName}</DialogTitle>
          <DialogDescription>
            {isOnline
              ? 'Sync your screen with the band for this gig.'
              : 'Performance options limited while offline.'}
          </DialogDescription>
        </DialogHeader>

        {!isOnline ? (
          <div className="py-4 text-center space-y-4">
            <div className="bg-muted/30 p-4 rounded-full inline-flex">
              <CloudOff className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">You are Offline</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                Gig Sessions require an internet connection to sync with the band.
              </p>
            </div>
            <Button className="w-full" onClick={handleStandalone}>
              <Smartphone className="mr-2 h-4 w-4" /> Start in Standalone Mode
            </Button>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {existingSession ? (
              <div className="bg-secondary/20 p-4 rounded-lg border border-secondary flex flex-col items-center text-center gap-2">
                <Radio className="h-8 w-8 text-green-500 animate-pulse" />
                <div className="font-medium text-lg">Session in Progress</div>
                <div className="text-sm text-muted-foreground">
                  Leader: <span className="font-bold text-foreground">{leaderName}</span>
                </div>
                <Button className="w-full mt-2" onClick={handleJoinAsFollower}>
                  <Users className="mr-2 h-4 w-4" /> Join as Follower
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-center text-muted-foreground mb-4">
                  No active session found. You can start one as the leader.
                </div>
                <Button className="w-full" onClick={handleStartAsLeader}>
                  <Crown className="mr-2 h-4 w-4" /> Start as Leader
                </Button>
              </div>
            )}

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={handleStandalone}>
              <Smartphone className="mr-2 h-4 w-4" /> Standalone Mode
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
