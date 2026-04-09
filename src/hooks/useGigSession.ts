import { useEffect, useState, useRef } from 'react';
import { GigSession, GigSessionParticipant } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useBand } from '@/context/BandContext';
import { getGigSession, sendHeartbeat } from '@/lib/api';
import { wsClient } from '@/lib/wsClient';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/apiFetch';

export const useGigSession = (gigId: string | null) => {
  const { user }         = useAuth();
  const { activeBandId } = useBand();
  const [sessionData, setSessionData]     = useState<GigSession | null>(null);
  const [participants, setParticipants]   = useState<GigSessionParticipant[]>([]);
  const [loading, setLoading]             = useState(true);

  const sessionDataRef  = useRef<GigSession | null>(null);
  const participantsRef = useRef<GigSessionParticipant[]>([]);

  useEffect(() => { sessionDataRef.current  = sessionData; }, [sessionData]);
  useEffect(() => { participantsRef.current = participants; }, [participants]);

  const isLeader = !!(user?.id && sessionData?.leader_id === user.id);

  // ── Initial fetch ───────────────────────────────────────────────
  useEffect(() => {
    if (!gigId || !user || !activeBandId) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const fetchAll = async () => {
      try {
        const session = await getGigSession(activeBandId, gigId);
        if (!mounted) return;
        setSessionData(session);
        sessionDataRef.current = session;

        if (session?.id) {
          const parts = await apiFetch<GigSessionParticipant[]>(
            `/api/bands/${activeBandId}/gig-sessions/${session.id}/participants`
          );
          if (mounted && parts) {
            setParticipants(parts);
            participantsRef.current = parts;
          }
        }
      } catch (err) {
        console.error('[useGigSession] Fetch failed:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchAll();
    return () => { mounted = false; };
  }, [gigId, user?.id, activeBandId]);

  // ── WS real-time updates ────────────────────────────────────────
  useEffect(() => {
    if (!activeBandId || !user) return;

    // Join the gig session WS room if we have a session
    let sessionWsId: string | null = null;

    const refreshSession = async () => {
      if (!gigId || !activeBandId) return;
      try {
        const session = await getGigSession(activeBandId, gigId);
        if (!session) {
          setSessionData(null);
          sessionDataRef.current = null;
          return;
        }

        if (session.id !== sessionDataRef.current?.id && sessionWsId !== session.id) {
          if (sessionWsId) wsClient.leaveSession(sessionWsId);
          sessionWsId = session.id;
          wsClient.joinSession(session.id);
        }

        setSessionData(session);
        sessionDataRef.current = session;
      } catch {}
    };

    const refreshParticipants = async () => {
      const sid = sessionDataRef.current?.id;
      if (!sid || !activeBandId) return;
      try {
        const parts = await apiFetch<GigSessionParticipant[]>(
          `/api/bands/${activeBandId}/gig-sessions/${sid}/participants`
        );
        if (!parts) return;

        // Toast for new joiners
        const prevIds = new Set(participantsRef.current.map(p => p.user_id));
        parts.forEach(p => {
          if (!prevIds.has(p.user_id) && p.user_id !== user.id) {
            toast.info(`${p.profile?.first_name ?? 'A user'} joined the session.`);
          }
        });

        setParticipants(parts);
        participantsRef.current = parts;
      } catch {}
    };

    const unsub = wsClient.onMessage((msg: any) => {
      if (msg.type !== 'delta') return;

      if (msg.table === 'gig_sessions') void refreshSession();
      if (msg.table === 'gig_session_participants') void refreshParticipants();
      if (msg.table === 'leadership_requests') void refreshSession();
    });

    // Heartbeat every 10 seconds
    const heartbeatInterval = setInterval(() => {
      const sid = sessionDataRef.current?.id;
      if (sid && user?.id && activeBandId) {
        const isCurrentLeader = sessionDataRef.current?.leader_id === user.id;
        void sendHeartbeat(activeBandId, sid, isCurrentLeader);
      }
    }, 10_000);

    return () => {
      unsub();
      if (sessionWsId) wsClient.leaveSession(sessionWsId);
      clearInterval(heartbeatInterval);
    };
  }, [activeBandId, user?.id, gigId]);

  return {
    sessionData,
    participants,
    loading,
    isLeader,
    userId: user?.id,
  };
};
