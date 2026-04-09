import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/apiFetch';
import { useAuth } from '@/context/AuthContext';
import { useBand } from '@/context/BandContext';
import { Button } from '@/components/ui/button';
import { Radio, Coffee, ArrowRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { wsClient } from '@/lib/wsClient';

interface ActiveSessionInfo {
  id: string;
  gig_id: string;
  is_on_break: boolean;
  setlist_id: string;
}

export const ActiveSessionBanner = () => {
  const { user } = useAuth();
  const { activeBandId } = useBand();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [activeSession, setActiveSession] = useState<ActiveSessionInfo | null>(null);

  const checkParticipation = async () => {
    if (!user?.id || !activeBandId) return;
    try {
      const data = await apiGet<ActiveSessionInfo | null>(`/api/bands/${activeBandId}/gig-sessions/active`);
      setActiveSession(data ?? null);
    } catch {
      // Silent fail — just don't show banner
      setActiveSession(null);
    }
  };

  useEffect(() => {
    checkParticipation();
    // Re-check when WS sends a delta about sessions
    const unsub = wsClient.onMessage((msg: any) => {
      if (msg?.type === 'delta' && (msg.table === 'gig_sessions' || msg.table === 'gig_session_participants')) {
        void checkParticipation();
      }
    });
    return () => { unsub(); };
  }, [user?.id, activeBandId]);

  const isInPerformance =
    location.pathname.startsWith('/performance') &&
    location.search.includes(activeSession?.gig_id ?? 'none');

  if (!activeSession || isInPerformance || !activeSession.setlist_id) return null;

  return (
    <div className={cn(
      'fixed bottom-[70px] md:bottom-4 left-4 right-4 z-50 rounded-lg shadow-lg border p-3 flex items-center justify-between animate-in slide-in-from-bottom-5',
      activeSession.is_on_break
        ? 'bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-950/80 dark:border-amber-800 dark:text-amber-100'
        : 'bg-primary text-primary-foreground'
    )}>
      <div className="flex items-center gap-3">
        <div className={cn('p-2 rounded-full', activeSession.is_on_break ? 'bg-amber-200/50 dark:bg-amber-900' : 'bg-white/20')}>
          {activeSession.is_on_break
            ? <Coffee className="h-5 w-5" />
            : <Radio className="h-5 w-5 animate-pulse" />}
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-sm">{activeSession.is_on_break ? 'Band is on Break' : 'Gig in Session'}</span>
          <span className="text-xs opacity-90">Tap to rejoin performance</span>
        </div>
      </div>
      <Button
        size="sm"
        variant={activeSession.is_on_break ? 'outline' : 'secondary'}
        className={cn('h-8', activeSession.is_on_break && 'border-amber-500 hover:bg-amber-200 dark:hover:bg-amber-900')}
        onClick={() => navigate(`/performance/${activeSession.setlist_id}?gigId=${activeSession.gig_id}`)}
      >
        Rejoin <ArrowRight className="ml-1 h-3 w-3" />
      </Button>
    </div>
  );
};
