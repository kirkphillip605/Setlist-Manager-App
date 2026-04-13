import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { 
  addSkippedSong, removeSkippedSong, updateSessionState, 
  endGigSession, requestLeadership, forceLeadership, resolveLeadershipRequest,
  leaveGigSession, getGigSession, joinGigSession
} from "@/lib/api";
import { Song } from "@/types";
import { Button } from "@/components/ui/button";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from "@/components/ui/dialog";
import { 
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { 
  ChevronLeft, ChevronRight, Search, Loader2, Music, Minimize2, Menu, Timer, Edit, Forward, Check, CloudOff, Users, Crown, Radio, LogOut, AlertTriangle, Wifi, WifiOff, History, ZoomIn, ZoomOut, List, Coffee, Bell, X, Activity, Music2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMetronome } from "@/components/MetronomeContext";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MetronomeControls } from "@/components/MetronomeControls";
import { useSetlistWithSongs, useSyncedSongs, useSyncedSkippedSongs } from "@/hooks/useSyncedData";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useGigSession } from "@/hooks/useGigSession";
import { wsClient } from "@/lib/wsClient";
import { apiGet } from "@/lib/apiFetch";
import { Badge } from "@/components/ui/badge";
import { TempoBlinker } from "@/components/TempoBlinker";
import { useAuth } from "@/context/AuthContext";
import { useBand } from "@/context/BandContext";
import { useGesture } from "@use-gesture/react";
import { KeepAwake } from "@capacitor-community/keep-awake";
import { Haptics, NotificationType } from '@capacitor/haptics';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const PerformanceMode = () => {
  const { id } = useParams(); // Setlist ID
  const [searchParams] = useSearchParams();
  const gigId = searchParams.get('gigId');
  const initialStandalone = searchParams.get('standalone') === 'true';
  const isOnline = useNetworkStatus();
  const { profile } = useAuth();
  const { activeBandId } = useBand();

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { openMetronome, isOpen: isMetronomeOpen, bpm, closeMetronome, setBpm } = useMetronome();
  
  // -- Preferences --
  const blinkerEnabled = profile?.preferences?.tempo_blinker_enabled !== false;
  const blinkerColor = profile?.preferences?.tempo_blinker_color || 'amber';
  const viewMode = profile?.preferences?.performance_view || 'full';

  // -- Failover State --
  const [isForcedStandalone, setIsForcedStandalone] = useState(initialStandalone);
  const [offlineCountdown, setOfflineCountdown] = useState<number | null>(null);
  const [previousSessionId, setPreviousSessionId] = useState<string | null>(null);
  
  // Recovery Dialogs
  const [recoveryData, setRecoveryData] = useState<{ type: 'leader' | 'follower', session: any } | null>(null);

  // -- Header Scroll State --
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  // -- Refs --
  const wasOnBreak = useRef(false);

  // -- Keep Awake --
  useEffect(() => {
    const keepAwake = async () => {
        try {
            await KeepAwake.keepAwake();
            console.log("Screen wake lock enabled");
        } catch (err) {
            console.warn("KeepAwake not supported:", err);
        }
    };

    keepAwake();

    return () => {
        const allowSleep = async () => {
            try {
                await KeepAwake.allowSleep();
                console.log("Screen wake lock disabled");
            } catch (err) {}
        };
        allowSleep();
    };
  }, []);

  // -- Zoom State --
  const [fontSize, setFontSize] = useState(() => {
      const saved = localStorage.getItem("lyrics_font_size");
      return saved ? parseInt(saved) : 24; // Default 24px
  });

  const handleZoom = (delta: number) => {
      setFontSize(prev => {
          const newState = Math.min(Math.max(prev + delta, 12), 120);
          localStorage.setItem("lyrics_font_size", newState.toString());
          return newState;
      });
  };

  const handleLyricsScroll = (e: React.UIEvent<HTMLDivElement>) => {
      const scrollTop = e.currentTarget.scrollTop;
      const threshold = 40; // Pixels to scroll before collapsing
      
      if (scrollTop > threshold && !isHeaderCollapsed) {
          setIsHeaderCollapsed(true);
      } else if (scrollTop < threshold && isHeaderCollapsed) {
          setIsHeaderCollapsed(false);
      }
  };

  // Determine effective mode for Logic
  const isGigMode = !!gigId && !isForcedStandalone;

  // -- Session Hook --
  const { sessionData, participants, isLeader, loading: sessionLoading, userId } = useGigSession(isGigMode ? gigId : null);

  // -- Permission Check --
  const canNavigate = !isGigMode || isLeader;

  // Local State
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [tempSong, setTempSong] = useState<Song | null>(null);
  
  // Break / Transition Logic
  const [isBreakDialogOpen, setIsBreakDialogOpen] = useState(false);
  const [showSetTransition, setShowSetTransition] = useState(false);
  const isOnBreak = sessionData?.is_on_break || false;

  // Alert Logic
  useEffect(() => {
      if (!isGigMode || isLeader || sessionLoading || !sessionData) {
          if (sessionData) wasOnBreak.current = sessionData.is_on_break;
          return;
      }
      
      // Detect Resume
      if (wasOnBreak.current && !sessionData.is_on_break) {
          toast.success("Band is resuming!", {
              icon: <Bell className="h-5 w-5 animate-bounce" />,
              duration: 5000
          });
          Haptics.notification({ type: NotificationType.Success });
          const audio = new Audio('/notification.mp3');
          audio.play().catch(e => console.log("Audio play failed", e));
      }
      
      wasOnBreak.current = sessionData.is_on_break;
  }, [sessionData, isGigMode, isLeader, sessionLoading]);

  // -- Orphaned Session State --
  const [isOrphaned, setIsOrphaned] = useState(false);
  
  useEffect(() => {
      if (!isGigMode || isLeader || !sessionData || sessionData.is_on_break) {
          setIsOrphaned(false);
          return;
      }

      const checkHeartbeat = () => {
          const last = new Date(sessionData.last_heartbeat).getTime();
          const now = Date.now();
          if (now - last > 10 * 60 * 1000) {
              setIsOrphaned(true);
          } else {
              setIsOrphaned(false);
          }
      };

      checkHeartbeat();
      const interval = setInterval(checkHeartbeat, 30000); 
      return () => clearInterval(interval);
  }, [sessionData, isGigMode, isLeader]);

  // -- Offline Failover Logic --
  useEffect(() => {
      let timer: number;
      if (isOnline || isForcedStandalone || !isLeader) {
          setOfflineCountdown(null);
          return;
      }

      if (!isOnline && isGigMode && isLeader && offlineCountdown === null) {
          setOfflineCountdown(30);
      }

      if (offlineCountdown !== null && offlineCountdown > 0) {
          timer = window.setTimeout(() => setOfflineCountdown(c => (c && c > 0 ? c - 1 : 0)), 1000);
      } else if (offlineCountdown === 0) {
          handleSwitchToStandalone();
      }

      return () => clearTimeout(timer);
  }, [isOnline, isForcedStandalone, isLeader, isGigMode, offlineCountdown]);

  const handleSwitchToStandalone = () => {
      setOfflineCountdown(null);
      if (sessionData) {
          setPreviousSessionId(sessionData.id);
      }
      setIsForcedStandalone(true);
      toast.info("Switched to Standalone Mode");
  };

  // -- Online Recovery Logic --
  useEffect(() => {
      const checkRecovery = async () => {
          if (isOnline && isForcedStandalone && previousSessionId && gigId) {
              try {
                  const session = await getGigSession(activeBandId!, gigId);
                  
                  if (!session || !session.is_active) {
                      setPreviousSessionId(null); 
                      return;
                  }

                  if (session.leader_id === userId) {
                      setRecoveryData({ type: 'leader', session });
                  } else {
                      setRecoveryData({ type: 'follower', session });
                  }
              } catch (e) {
                  console.error("Error checking session recovery", e);
              }
          }
      };
      checkRecovery();
  }, [isOnline, isForcedStandalone, previousSessionId, gigId, userId]);

  const handleRecoveryConfirm = async () => {
      if (!recoveryData) return;

      if (recoveryData.type === 'leader') {
          await updateSessionState(activeBandId!, recoveryData.session.id, {
              current_set_index: currentSetIndex,
              current_song_index: currentSongIndex,
              adhoc_song_id: tempSong?.id || null
          });
          await forceLeadership(activeBandId!, recoveryData.session.id, userId!);
          
          setIsForcedStandalone(false);
          toast.success("Resumed Gig Session");
      } else {
          await joinGigSession(activeBandId!, recoveryData.session.id);
          setIsForcedStandalone(false);
          toast.success("Rejoined Session as Follower");
      }
      setRecoveryData(null);
  };

  const handleRecoveryDecline = async () => {
      if (!recoveryData) return;

      if (recoveryData.type === 'leader') {
          await endGigSession(activeBandId!, recoveryData.session.id);
          toast.info("Gig Session Ended. Remaining in Standalone.");
      } else {
          await leaveGigSession(activeBandId!, recoveryData.session.id);
          toast.info("Left Session. Remaining in Standalone.");
      }
      
      setPreviousSessionId(null); 
      setRecoveryData(null);
  };

  // -- Derived Data --
  const setlist = useSetlistWithSongs(id);
  const { data: allSongs = [] } = useSyncedSongs();
  const { data: allSkipped = [] } = useSyncedSkippedSongs();

  useEffect(() => {
    if (!setlist && id) {
      navigate('/performance', { replace: true });
    }
  }, [setlist, id, navigate]);

  const skippedSongs = useMemo(() => {
      if (!gigId) return [];
      return allSkipped
        .filter((entry: any) => entry.gig_id === gigId)
        .map((entry: any) => entry.song)
        .filter(Boolean) as Song[];
  }, [allSkipped, gigId]);

  const sets = useMemo(() => {
      if (!setlist) return [];
      return setlist.sets; 
  }, [setlist]);

  // -- Sync Effect (Follower Logic) --
  useEffect(() => {
      if (isGigMode && sessionData && !isLeader) {
          // Reset collapse state on song change
          if (sessionData.current_song_index !== currentSongIndex || sessionData.current_set_index !== currentSetIndex) {
              setIsHeaderCollapsed(false);
          }

          setCurrentSetIndex(sessionData.current_set_index);
          setCurrentSongIndex(sessionData.current_song_index);
          if (sessionData.adhoc_song_id) {
              const found = allSongs.find(s => s.id === sessionData.adhoc_song_id);
              if (found) setTempSong(found);
          } else {
              setTempSong(null);
          }
      }
  }, [sessionData, isGigMode, isLeader, allSongs]);

  const broadcastState = async (setIdx: number, songIdx: number, adhocId: string | null) => {
      if (isGigMode && isLeader && sessionData) {
          await updateSessionState(activeBandId!, sessionData.id, {
              current_set_index: setIdx,
              current_song_index: songIdx,
              adhoc_song_id: adhocId
          });
      }
  };

  const handleGoOnBreak = async () => {
      if (!isGigMode || !isLeader || !sessionData) return;
      
      const updates: any = { is_on_break: true };

      if (showSetTransition) {
          const nextSetIdx = currentSetIndex + 1;
          if (nextSetIdx < sets.length) {
              updates.current_set_index = nextSetIdx;
              updates.current_song_index = 0;
              setCurrentSetIndex(nextSetIdx);
              setCurrentSongIndex(0);
          }
      }

      await updateSessionState(activeBandId!, sessionData.id, updates);
      setIsBreakDialogOpen(false);
      setShowSetTransition(false); 
      setMenuOpen(false);
      toast.success("Session is now on break");
  };

  const handleResumeBreak = async () => {
      if (!isGigMode || !isLeader || !sessionData) return;
      await updateSessionState(activeBandId!, sessionData.id, { is_on_break: false });
      toast.success("Break ended. Session resumed.");
  };

  const handleContinueToNextSet = () => {
      if (!canNavigate) return; // Guard
      if (!setlist) return;
      const nextSetIdx = currentSetIndex + 1;
      
      if (nextSetIdx < sets.length) {
          setCurrentSetIndex(nextSetIdx);
          setCurrentSongIndex(0);
          setIsHeaderCollapsed(false); // Reset
          setShowSetTransition(false);
          if (isLeader) broadcastState(nextSetIdx, 0, null);
      } else {
          setShowSetTransition(false);
      }
  };

  // -- Navigation Handlers --
  const handleNext = () => {
    if (!canNavigate) return;

    if (showSetTransition) {
        handleContinueToNextSet();
        return;
    }

    // Reset scroll/header on nav
    setIsHeaderCollapsed(false);

    if (tempSong) {
      setTempSong(null);
      const currentSet = sets[currentSetIndex];
      let nextSetIdx = currentSetIndex;
      let nextSongIdx = currentSongIndex;

      if (currentSongIndex < currentSet.songs.length - 1) {
          nextSongIdx++;
      } else if (currentSetIndex < sets.length - 1) {
          nextSetIdx++;
          nextSongIdx = 0;
      }
      
      setCurrentSetIndex(nextSetIdx);
      setCurrentSongIndex(nextSongIdx);
      if (isLeader) broadcastState(nextSetIdx, nextSongIdx, null);
      return;
    }

    if (!setlist) return;
    const currentSet = sets[currentSetIndex];
    if (!currentSet) return;

    if (currentSongIndex >= currentSet.songs.length - 1) {
        if (currentSetIndex < sets.length - 1) {
            if (isLeader) {
                setShowSetTransition(true);
            } else {
                setCurrentSetIndex(currentSetIndex + 1);
                setCurrentSongIndex(0);
            }
            return;
        } else {
            return;
        }
    }

    const nextSongIdx = currentSongIndex + 1;
    setCurrentSongIndex(nextSongIdx);
    if (isLeader) broadcastState(currentSetIndex, nextSongIdx, null);
  };

  const handlePrev = () => {
    if (!canNavigate) return;

    if (showSetTransition) {
        setShowSetTransition(false);
        return;
    }

    setIsHeaderCollapsed(false);

    if (tempSong) {
      setTempSong(null);
      if (isLeader) broadcastState(currentSetIndex, currentSongIndex, null);
      return;
    }
    if (!setlist) return;

    let nextSetIdx = currentSetIndex;
    let nextSongIdx = currentSongIndex;

    if (currentSongIndex > 0) {
      nextSongIdx--;
    } else if (currentSetIndex > 0) {
      nextSetIdx--;
      const prevSet = sets[nextSetIdx];
      nextSongIdx = prevSet.songs.length - 1;
    }

    setCurrentSetIndex(nextSetIdx);
    setCurrentSongIndex(nextSongIdx);

    if (isLeader) broadcastState(nextSetIdx, nextSongIdx, null);
  };

  const handleSetChange = (value: string) => {
    if (!canNavigate) return;

    const index = parseInt(value);
    if (!isNaN(index)) {
      setTempSong(null);
      setCurrentSetIndex(index);
      setCurrentSongIndex(0);
      setIsHeaderCollapsed(false);
      setShowSetTransition(false);
      if (isLeader) broadcastState(index, 0, null);
    }
  };

  const handleAdHocSelect = (song: Song) => {
      if (!canNavigate) return;

      setTempSong(song);
      setIsHeaderCollapsed(false);
      setIsSearchOpen(false);
      setSearchQuery("");
      setShowSetTransition(false);
      if (isLeader) broadcastState(currentSetIndex, currentSongIndex, song.id);
  };

  const handleSkipSong = async () => {
      if (!gigId || !activeSong || !isLeader) return;
      await addSkippedSong(activeBandId!, gigId, activeSong.id);
      toast.info("Song skipped");
      handleNext();
  };

  const handleRestoreSkippedSong = async (song: Song) => {
      if (!gigId || !canNavigate) return;
      await removeSkippedSong(activeBandId!, gigId, song.id);
      handleAdHocSelect(song);
      setShowSkippedSongs(false);
      toast.success("Playing skipped song");
  };

  // -- UI States --
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showSkippedSongs, setShowSkippedSongs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showLeaderRequest, setShowLeaderRequest] = useState(false);
  const [incomingRequest, setIncomingRequest] = useState<any>(null);
  const [showSetSongsDialog, setShowSetSongsDialog] = useState(false);
  
  // Slide Out Menu State
  const [menuOpen, setMenuOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);

  // -- Auto Scroll for Set Songs Dialog --
  useEffect(() => {
      if (showSetSongsDialog && !tempSong) {
          setTimeout(() => {
              const activeEl = document.getElementById(`dialog-song-${currentSetIndex}-${currentSongIndex}`);
              if (activeEl) {
                  activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
          }, 150);
      }
  }, [showSetSongsDialog, currentSetIndex, currentSongIndex, tempSong]);

  // -- Listen for Incoming Leadership Requests via WS delta --
  useEffect(() => {
      if (!isLeader || !sessionData) return;
      const unsub = wsClient.onMessage(async (msg: any) => {
          if (
              msg?.type === 'delta' &&
              msg.table === 'leadership_requests' &&
              msg.event === 'INSERT' &&
              msg.data?.session_id === sessionData.id &&
              msg.data?.status === 'pending'
          ) {
              try {
                  const requester = await apiGet<{ first_name: string; last_name: string }>(
                      `/api/users/${msg.data.requester_id}/public`
                  );
                  setIncomingRequest({
                      ...msg.data,
                      userName: `${requester?.first_name ?? ''} ${requester?.last_name ?? ''}`.trim() || 'A bandmate',
                  });
              } catch {
                  setIncomingRequest({ ...msg.data, userName: 'A bandmate' });
              }
          }
      });
      return () => { unsub(); };
  }, [isLeader, sessionData]);

  const [sessionEndedInfo, setSessionEndedInfo] = useState<{ endedBy: string, at: string } | null>(null);
  
  useEffect(() => {
      if (isGigMode && sessionData && !sessionData.is_active && !isForcedStandalone) {
           setSessionEndedInfo({
              endedBy: "Leader",
              at: new Date(sessionData.ended_at || new Date()).toLocaleTimeString()
          });
      }
      if(isGigMode && !sessionLoading && sessionData === null && sessionEndedInfo === null && !isForcedStandalone) {
          setSessionEndedInfo({
              endedBy: "Leader",
              at: new Date().toLocaleTimeString()
          });
      }
  }, [sessionData, isGigMode, isForcedStandalone, sessionLoading]);

  // -- Leadership Actions --
  const handleRequestLeadership = async () => {
      if (!sessionData || !userId) return;
      const now = new Date().getTime();
      const lastBeat = new Date(sessionData.last_heartbeat).getTime();
      const diff = (now - lastBeat) / 1000;

      if (diff > 30 || isOrphaned) {
          await forceLeadership(activeBandId!, sessionData.id, userId);
          toast.success("You are now the leader.");
          setShowLeaderRequest(false);
          setIsOrphaned(false);
      } else {
          await requestLeadership(activeBandId!, sessionData.id);
          toast.info("Request sent to current leader.");
          setShowLeaderRequest(false);
      }
  };

  const handleResolveRequest = async (approved: boolean) => {
      if (!incomingRequest) return;
      await resolveLeadershipRequest(activeBandId!, incomingRequest.id, approved ? 'approved' : 'denied');
      if (approved && userId) {
          await forceLeadership(activeBandId!, sessionData!.id, incomingRequest.requester_id);
          toast.success("Leadership transferred.");
      }
      setIncomingRequest(null);
  };

  const handleTransferAndLeave = async (newLeaderId: string) => {
      if (!sessionData) return;
      await forceLeadership(activeBandId!, sessionData.id, newLeaderId);
      await leaveGigSession(activeBandId!, sessionData.id);
      navigate('/gigs');
  };

  const handleEndSession = async () => {
      if (!sessionData) return;
      await endGigSession(activeBandId!, sessionData.id);
      navigate('/gigs');
  };

  const handleFollowerExit = async () => {
      if (sessionData) {
          try {
              await leaveGigSession(activeBandId!, sessionData.id);
          } catch (e) {
              console.error("Failed to leave session cleanly", e);
          }
      }
      navigate(initialStandalone ? '/performance' : '/gigs');
  };

  // -- Render Helpers --
  const currentSet = sets[currentSetIndex];
  const activeSong = tempSong || currentSet?.songs[currentSongIndex]?.song;
  const filteredSongs = allSongs.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()) || s.artist.toLowerCase().includes(searchQuery.toLowerCase()));
  
  // Metronome Logic
  const showMetronome = !gigId || isForcedStandalone;

  // -- Auto Update Metronome BPM --
  useEffect(() => {
      if (isMetronomeOpen && activeSong?.tempo) {
          const bpmVal = parseInt(activeSong.tempo);
          if (!isNaN(bpmVal)) {
              setBpm(bpmVal);
          }
      }
  }, [activeSong, isMetronomeOpen, setBpm]);

  const nextSong = useMemo(() => {
      if (tempSong) {
          if (!currentSet) return null;
          if (currentSongIndex < currentSet.songs.length - 1) {
              return currentSet.songs[currentSongIndex + 1].song;
          }
          if (currentSetIndex < sets.length - 1) {
              const nextSet = sets[currentSetIndex + 1];
              if (nextSet.songs.length > 0) return nextSet.songs[0].song;
          }
          return null;
      }

      if (!currentSet) return null;
      if (currentSongIndex < currentSet.songs.length - 1) {
          return currentSet.songs[currentSongIndex + 1].song;
      }
      if (currentSetIndex < sets.length - 1) {
          const nextSet = sets[currentSetIndex + 1];
          if (nextSet.songs.length > 0) return nextSet.songs[0].song;
      }
      return null;
  }, [currentSet, currentSongIndex, currentSetIndex, sets, tempSong]);

  const bind = useGesture({
    onPinch: ({ direction: [d] }) => {
        if (d > 0) handleZoom(1);
        if (d < 0) handleZoom(-1);
    },
    onDragEnd: ({ swipe: [swipeX] }) => {
        if (!canNavigate) return;
        if (swipeX === -1) { 
            handleNext();
        } else if (swipeX === 1) { 
            handlePrev();
        }
    }
  }, {
      drag: { axis: 'x', filterTaps: true, threshold: 50 },
      pinch: { scaleBounds: { min: 0.5, max: 3 } }
  });

  // --- SIMPLE VIEW RENDERER ---
  const renderSimpleView = () => (
      <div 
        className="flex flex-col items-center justify-center h-full p-4 text-center space-y-4 md:space-y-8 overflow-hidden touch-pan-y" 
        {...bind()}
      >
          {activeSong ? (
              <>
                  <div className="space-y-2 max-w-[90vw]">
                      <h2 className="text-[7vw] md:text-[6vw] font-bold leading-tight tracking-tight select-none truncate">
                          {activeSong.title}
                      </h2>
                      <p className="text-[4vw] md:text-[3vw] text-muted-foreground select-none truncate">
                          {activeSong.artist}
                      </p>
                  </div>
                  
                  <div className="flex flex-wrap gap-4 md:gap-8 justify-center w-full">
                      <div className="bg-secondary/30 p-4 rounded-2xl w-[35vw] max-w-[200px] border border-border/50 flex flex-col items-center justify-center aspect-square">
                          <div className="text-[2vh] text-muted-foreground uppercase font-semibold select-none">Key</div>
                          <div className="text-[6vh] font-bold select-none leading-none mt-2">{activeSong.key || "-"}</div>
                      </div>
                      <div className="bg-secondary/30 p-4 rounded-2xl w-[35vw] max-w-[200px] border border-border/50 flex flex-col items-center justify-center aspect-square">
                          <div className="text-[2vh] text-muted-foreground uppercase font-semibold select-none">Tempo</div>
                          <div className="text-[6vh] font-bold select-none leading-none mt-2">{activeSong.tempo ? `${activeSong.tempo}` : "-"}</div>
                      </div>
                  </div>

                  {activeSong.note && (
                      <div className="bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 px-4 py-2 rounded-xl text-[2.5vh] font-medium max-w-[80vw] select-none truncate">
                          {activeSong.note}
                      </div>
                  )}
              </>
          ) : (
              <div className="text-muted-foreground text-2xl select-none">Waiting for song...</div>
          )}
      </div>
  );

  // --- FULL VIEW RENDERER (Updated Design) ---
  const renderFullView = () => (
      <div className="flex flex-col h-full bg-background">
        {/* Sticky Secondary Header */}
        <div className={cn(
            "border-b bg-background/95 backdrop-blur shrink-0 z-10 transition-all duration-300 ease-in-out px-4 flex items-center justify-between",
            isHeaderCollapsed ? "py-2" : "py-3"
        )}>
            {activeSong ? (
                <div className="flex-1 min-w-0 pr-4">
                    {/* Line 1: Title (Full width) */}
                    <div className={cn(
                        "font-bold leading-tight truncate transition-all duration-300",
                        isHeaderCollapsed ? "text-lg" : "text-xl md:text-2xl"
                    )}>
                        {activeSong.title}
                    </div>

                    {/* Line 2: Artist */}
                    <div className={cn(
                        "text-muted-foreground truncate transition-all duration-300 origin-top text-xs md:text-sm font-medium",
                        isHeaderCollapsed ? "h-0 opacity-0" : "h-auto opacity-100 mt-0.5"
                    )}>
                        {activeSong.artist}
                    </div>

                    {/* Line 3: Note */}
                    {activeSong.note && (
                        <div className={cn(
                            "transition-all duration-300 origin-top overflow-hidden mt-1",
                            isHeaderCollapsed ? "h-0 opacity-0" : "h-auto opacity-100"
                        )}>
                            <span className="bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded text-[10px] md:text-xs font-semibold inline-block truncate max-w-full">
                                {activeSong.note}
                            </span>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-2 text-muted-foreground w-full">
                    <p>{isLeader || initialStandalone || isForcedStandalone ? "Select a song to begin" : "Waiting for leader..."}</p>
                </div>
            )}

            {/* Right Side: Tempo Blinker */}
            {isGigMode && activeSong?.tempo && blinkerEnabled && (
                <div className="shrink-0 flex items-center justify-center h-full pl-2">
                    <TempoBlinker 
                        bpm={parseInt(activeSong.tempo)} 
                        color={blinkerColor}
                        className="w-6 h-6 md:w-8 md:h-8 shrink-0" 
                    />
                </div>
            )}
        </div>

        {/* Scrollable Lyrics Area */}
        <div 
            className="flex-1 overflow-y-auto relative overscroll-contain touch-pan-y"
            onScroll={handleLyricsScroll}
            {...bind()}
        >
            {activeSong && (
                <div className="p-4 md:p-8 min-h-full pb-32">
                    <div 
                        className="whitespace-pre-wrap font-mono leading-relaxed transition-all duration-200 select-none"
                        style={{ fontSize: `${fontSize}px` }}
                    >
                        {activeSong.lyrics || <div className="flex items-center justify-center h-40 text-muted-foreground italic text-base">No lyrics available.</div>}
                    </div>
                </div>
            )}

            {/* Zoom Controls */}
            <div className="absolute bottom-4 left-4 flex flex-col gap-2 z-20 opacity-20 hover:opacity-100 transition-opacity sticky float-left">
                <Button variant="secondary" size="icon" className="h-10 w-10 shadow-lg rounded-full" onClick={() => handleZoom(2)}>
                    <ZoomIn className="h-5 w-5" />
                </Button>
                <Button variant="secondary" size="icon" className="h-10 w-10 shadow-lg rounded-full" onClick={() => handleZoom(-2)}>
                    <ZoomOut className="h-5 w-5" />
                </Button>
            </div>

            {tempSong && (
                <div className="absolute top-4 left-4 bg-orange-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg animate-pulse z-20 sticky float-left">Ad-Hoc</div>
            )}
        </div>
      </div>
  );

  // --- CONTENT SWITCHER ---
  const renderContent = () => {
      if (isGigMode && sessionEndedInfo && !isForcedStandalone) {
          return (
              <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center">
                  <Radio className="h-16 w-16 text-muted-foreground mb-4" />
                  <h2 className="text-2xl font-bold mb-2">Session Ended</h2>
                  <p className="text-muted-foreground mb-6">
                      Performance ended by <span className="font-bold">{sessionEndedInfo.endedBy}</span> at {sessionEndedInfo.at}.
                  </p>
                  <div className="flex gap-4">
                      <Button onClick={() => navigate('/gigs')}>Go to Gigs</Button>
                      <Button variant="outline" onClick={() => navigate('/')}>Dashboard</Button>
                  </div>
              </div>
          );
      }

      if (isGigMode && isOnBreak) {
          return (
              <div className="flex flex-col items-center justify-center h-screen bg-amber-50 dark:bg-amber-950/20 text-center p-6 space-y-6">
                  <div className="w-24 h-24 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center animate-pulse">
                      <Coffee className="w-12 h-12 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="space-y-2">
                      <h1 className="text-4xl font-bold text-amber-800 dark:text-amber-200">On Break</h1>
                      <p className="text-lg text-amber-700/80 dark:text-amber-300/80">
                          Grab a drink! We'll be back shortly.
                      </p>
                  </div>
                  
                  {isLeader && (
                      <Button size="lg" className="bg-amber-600 hover:bg-amber-700 text-white mt-8" onClick={handleResumeBreak}>
                          <Radio className="mr-2 h-5 w-5 animate-pulse" /> Resume Gig
                      </Button>
                  )}
                  
                  {!isLeader && (
                      <div className="mt-8 flex flex-col gap-4 w-full max-w-xs">
                          <Button variant="outline" onClick={handleFollowerExit}>
                              Exit Session
                          </Button>
                          <p className="text-xs text-muted-foreground">You will be notified when the leader resumes.</p>
                      </div>
                  )}
              </div>
          );
      }

      if (isGigMode && isLeader && showSetTransition) {
          const nextSet = sets[currentSetIndex + 1];
          return (
              <div className="flex flex-col items-center justify-center h-screen bg-background text-center p-6 space-y-8" {...bind()}>
                  <div className="space-y-4">
                      <div className="text-sm uppercase tracking-widest text-muted-foreground font-semibold">Coming Up</div>
                      <h1 className="text-5xl font-bold text-primary">{nextSet?.name || "Next Set"}</h1>
                      <div className="text-xl text-muted-foreground">{nextSet?.songs.length || 0} Songs</div>
                  </div>

                  <div className="flex flex-col gap-4 w-full max-w-sm">
                      <Button size="lg" className="h-16 text-lg" onClick={handleContinueToNextSet}>
                          Continue to {nextSet?.name} <ChevronRight className="ml-2 h-6 w-6" />
                      </Button>
                      
                      <div className="relative py-2">
                          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                          <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or</span></div>
                      </div>

                      <Button variant="outline" size="lg" className="h-14 text-amber-600 border-amber-200 hover:bg-amber-50" onClick={() => setIsBreakDialogOpen(true)}>
                          <Coffee className="mr-2 h-5 w-5" /> Go On Break
                      </Button>
                  </div>
              </div>
          );
      }

      return (
          <div className="flex flex-col h-full overflow-hidden">
              {/* --- Top Bar --- */}
              <div className="flex items-center justify-between px-3 py-2 border-b bg-card shadow-sm shrink-0 h-14 gap-2 relative z-40">
                <div className="flex-1 flex items-center gap-2 overflow-hidden">
                  {!isOnline && <CloudOff className="h-4 w-4 text-muted-foreground shrink-0" />}
                  {canNavigate ? (
                      <div className="flex items-center gap-2 w-full max-w-[320px]">
                          <Select value={currentSetIndex.toString()} onValueChange={handleSetChange} disabled={!!tempSong}>
                            <SelectTrigger className="h-9 w-full truncate"><SelectValue placeholder="Select Set" /></SelectTrigger>
                            <SelectContent>
                              {sets.map((set, idx) => <SelectItem key={set.id} value={idx.toString()}>{set.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setShowSetSongsDialog(true)}>
                              <List className="h-4 w-4" />
                          </Button>
                      </div>
                  ) : (
                      <div className="bg-muted px-3 py-2 rounded text-sm font-medium flex items-center gap-2 truncate">
                          <Radio className="h-3 w-3 text-green-500 animate-pulse shrink-0" /> <span className="truncate">Following</span>
                      </div>
                  )}
                </div>
                
                <div className="flex items-center justify-end shrink-0">
                    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-10 w-10">
                                <Menu className="h-6 w-6" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-[300px] sm:w-[350px] flex flex-col p-0 gap-0">
                            <SheetHeader className="px-6 py-4 border-b text-left">
                                <SheetTitle className="flex items-center gap-2">
                                    <List className="h-5 w-5" /> Session Menu
                                </SheetTitle>
                            </SheetHeader>
                            
                            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                                {/* Set Info Card */}
                                <div className="space-y-4">
                                    <div className="bg-muted/30 p-4 rounded-xl border flex justify-between items-center">
                                        <div className="text-sm font-medium text-muted-foreground">Current Set</div>
                                        <div className="text-xl font-bold">{currentSetIndex + 1}</div>
                                    </div>

                                    {/* Key & Tempo Card - Sleek */}
                                    <div className="bg-card rounded-xl border shadow-sm flex items-stretch divide-x overflow-hidden">
                                        <div className="flex-1 p-4 flex flex-col items-center justify-center bg-secondary/5">
                                            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Key</div>
                                            <div className="text-2xl font-bold text-primary">{activeSong?.key || "-"}</div>
                                        </div>
                                        <div className="flex-1 p-4 flex flex-col items-center justify-center bg-secondary/5">
                                            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Tempo</div>
                                            <div className="text-2xl font-bold text-primary">{activeSong?.tempo || "-"}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="space-y-2">
                                    <h4 className="text-sm font-medium text-muted-foreground mb-2 px-1">Actions</h4>
                                    
                                    {/* Metronome only for Standalone Mode */}
                                    {showMetronome && (
                                        isMetronomeOpen ? (
                                            <Button variant="outline" className="w-full justify-start h-12 gap-3" onClick={closeMetronome}>
                                                <Timer className="h-5 w-5" /> Stop Metronome
                                            </Button>
                                        ) : (
                                            <Button variant="outline" className="w-full justify-start h-12 gap-3" onClick={() => { setMenuOpen(false); openMetronome(activeSong?.tempo ? parseInt(activeSong.tempo) : 120); }}>
                                                <Timer className="h-5 w-5" /> Start Metronome
                                            </Button>
                                        )
                                    )}

                                    {isGigMode && isLeader && isOnline && (
                                        <Button variant="outline" className="w-full justify-start h-12 gap-3 text-amber-600 border-amber-200 hover:bg-amber-50" onClick={() => setIsBreakDialogOpen(true)}>
                                            <Coffee className="h-5 w-5" /> Go On Break
                                        </Button>
                                    )}

                                    {isLeader && isGigMode && skippedSongs.length > 0 && (
                                        <Button variant="outline" className="w-full justify-start h-12 gap-3 text-orange-600 border-orange-200" onClick={() => { setMenuOpen(false); setShowSkippedSongs(true); }}>
                                            <History className="h-5 w-5" /> Skipped Songs ({skippedSongs.length})
                                        </Button>
                                    )}
                                </div>

                                {/* Participants Section (Inline) */}
                                {isGigMode && (
                                    <Collapsible open={participantsOpen} onOpenChange={setParticipantsOpen} className="border rounded-xl bg-card overflow-hidden">
                                        <CollapsibleTrigger asChild>
                                            <Button variant="ghost" className="w-full justify-between p-4 h-auto font-normal rounded-none hover:bg-secondary/20">
                                                <div className="flex items-center gap-3">
                                                    <Users className="h-5 w-5 text-muted-foreground" />
                                                    <span className="font-medium">Participants</span>
                                                </div>
                                                <span className="bg-muted px-2 py-0.5 rounded text-xs font-bold">{participants.length}</span>
                                            </Button>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="px-4 pb-4 border-t bg-muted/10">
                                            <div className="space-y-2 mt-3 max-h-[200px] overflow-y-auto pr-1">
                                                {participants.map(p => {
                                                    const isPLeader = sessionData?.leader_id === p.user_id;
                                                    return (
                                                        <div key={p.id} className="flex items-center justify-between p-2 rounded bg-background border">
                                                            <div className="flex items-center gap-3">
                                                                <div className="bg-primary/10 w-8 h-8 rounded-full flex items-center justify-center text-primary font-bold text-xs">
                                                                    {p.profile?.first_name?.[0] || "?"}
                                                                </div>
                                                                <div>
                                                                    <div className="font-medium text-sm">{p.profile?.first_name} {p.profile?.last_name}</div>
                                                                    <div className="text-[10px] text-muted-foreground">{p.profile?.position}</div>
                                                                </div>
                                                            </div>
                                                            {isPLeader && <Badge className="text-[10px] h-5">Leader</Badge>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </CollapsibleContent>
                                    </Collapsible>
                                )}
                            </div>

                            <SheetFooter className="mt-auto border-t p-4 bg-muted/10">
                                {isGigMode && isLeader ? (
                                    <Button variant="destructive" className="w-full gap-2 h-12" onClick={() => setShowExitConfirm(true)}>
                                        <LogOut className="h-4 w-4" /> End Gig Session
                                    </Button>
                                ) : (
                                    <Button variant="destructive" className="w-full gap-2 h-12" onClick={handleFollowerExit}>
                                        <Minimize2 className="h-4 w-4" /> Exit Performance Mode
                                    </Button>
                                )}
                            </SheetFooter>
                        </SheetContent>
                    </Sheet>
                </div>
              </div>

              {/* --- Main Content --- */}
              <div className="flex-1 overflow-hidden relative bg-background">
                {viewMode === 'simple' ? renderSimpleView() : renderFullView()}
                {showMetronome && isMetronomeOpen && <div className="absolute bottom-0 left-0 right-0 z-30"><MetronomeControls variant="embedded" /></div>}
              </div>

              {/* --- Footer Controls --- */}
              <div className="bg-card shrink-0 flex items-center gap-3 z-20 relative border-t px-3 py-3 w-full safe-area-pb">
                {canNavigate ? (
                    <>
                        {/* Search Button (Small) */}
                        <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-12 w-12 shrink-0 rounded-xl" 
                            onClick={() => setIsSearchOpen(true)}
                        >
                            <Search className="h-5 w-5" />
                        </Button>

                        {/* Prev (Medium) */}
                        <Button 
                            variant="outline" 
                            className="h-12 px-4 min-w-[80px] rounded-xl font-medium" 
                            onClick={handlePrev} 
                            disabled={!tempSong && (currentSetIndex === 0 && currentSongIndex === 0)}
                        >
                            <ChevronLeft className="mr-1 h-5 w-5" /> Prev
                        </Button>
                        
                        {/* Next (Big) */}
                        <Button 
                            className={cn("flex-1 h-14 text-lg font-bold rounded-xl shadow-md bg-primary hover:bg-primary/90 text-primary-foreground", tempSong ? "bg-orange-600 hover:bg-orange-700" : "")} 
                            onClick={handleNext}
                        >
                            {tempSong ? "Resume Set" : "Next"} <ChevronRight className="ml-1 h-6 w-6" />
                        </Button>

                        {/* Skip Button (Small) */}
                        {isLeader && isGigMode && activeSong && !tempSong && isOnline ? (
                            <Button 
                                variant="secondary" 
                                size="icon" 
                                className="h-12 w-12 shrink-0 rounded-xl text-orange-600 border border-orange-200" 
                                onClick={handleSkipSong}
                                title="Skip Song"
                            >
                                <Forward className="h-5 w-5" />
                            </Button>
                        ) : (
                            // Spacer to keep layout if button not shown
                            <div className="w-12 h-12 shrink-0" />
                        )}
                    </>
                ) : (
                    <div className="flex gap-2 w-full">
                        <Button variant="outline" className="flex-1 h-14 text-lg" onClick={() => setMenuOpen(true)}>
                            <Users className="mr-2 h-5 w-5" /> View Menu
                        </Button>
                        <Button variant="secondary" className="flex-1 h-14 text-lg" onClick={() => setShowLeaderRequest(true)}>
                            <Crown className="mr-2 h-5 w-5" /> Become Leader
                        </Button>
                    </div>
                )}
              </div>
          </div>
      );
  };

  if (!setlist || (isGigMode && sessionLoading)) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="fixed inset-0 bg-background text-foreground flex flex-col z-50">
      
      {/* Alerts */}
      <AlertDialog open={offlineCountdown !== null}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                      <WifiOff className="h-5 w-5" /> Connection Lost
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                      Unable to reach the server. Switching to Standalone Mode in <b>{offlineCountdown}</b> seconds.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogAction onClick={handleSwitchToStandalone}>Switch Immediately</AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!recoveryData}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-green-600">
                      <Wifi className="h-5 w-5" /> Connection Restored
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                      {recoveryData?.type === 'leader' 
                        ? "Your session is still active. Do you want to re-enter and sync your current position?"
                        : "The session is still active, but there is a new leader. Join as a follower?"
                      }
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel onClick={handleRecoveryDecline}>
                      {recoveryData?.type === 'leader' ? "No, End Session" : "No, Stay Standalone"}
                  </AlertDialogCancel>
                  <AlertDialogAction onClick={handleRecoveryConfirm}>
                      {recoveryData?.type === 'leader' ? "Yes, Resume Session" : "Yes, Join Session"}
                  </AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isOrphaned && !isForcedStandalone}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="h-5 w-5" /> Connection Lost
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                      We haven't received updates from the leader for over 10 minutes.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4 space-y-3">
                  <p className="text-sm font-medium">Waiting for leader to rejoin...</p>
                  <div className="flex gap-2">
                      <Button className="flex-1" onClick={handleRequestLeadership}>
                          <Crown className="mr-2 h-4 w-4" /> Become Leader
                      </Button>
                      <Button variant="destructive" className="flex-1" onClick={() => {
                          if(sessionData) endGigSession(activeBandId!, sessionData.id);
                      }}>
                          End Session
                      </Button>
                  </div>
              </div>
          </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isBreakDialogOpen} onOpenChange={setIsBreakDialogOpen}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
                      <Coffee className="h-5 w-5" /> Go On Break?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                      This will pause the gig session for everyone. Inactivity timers will be disabled until you resume.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setIsBreakDialogOpen(false)}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleGoOnBreak} className="bg-amber-600 hover:bg-amber-700">Go On Break</AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      {renderContent()}

      {/* --- Dialogs --- */}
      
      {/* Set Songs List Dialog */}
      <Dialog open={showSetSongsDialog} onOpenChange={setShowSetSongsDialog}>
          <DialogContent className="max-h-[80vh] flex flex-col p-0 gap-0">
              <DialogHeader className="px-6 py-4 border-b">
                  <DialogTitle>Setlist Overview</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto min-h-0">
                  <div className="p-1">
                      {sets.map((set, setIdx) => (
                          <div key={set.id} className="mb-4">
                              <div className="sticky top-0 bg-muted/90 backdrop-blur p-2 text-sm font-bold border-b z-10 text-primary">
                                  {set.name}
                              </div>
                              <div className="divide-y">
                                  {set.songs.map((item, songIdx) => {
                                      const isActive = !tempSong && setIdx === currentSetIndex && songIdx === currentSongIndex;
                                      const isPast = !tempSong && (setIdx < currentSetIndex || (setIdx === currentSetIndex && songIdx < currentSongIndex));
                                      
                                      return (
                                          <div 
                                            key={item.id}
                                            id={`dialog-song-${setIdx}-${songIdx}`}
                                            className={cn(
                                                "p-4 flex items-center gap-3 cursor-pointer transition-colors",
                                                isActive ? "bg-primary/10 border-l-4 border-primary" : "hover:bg-accent",
                                                isPast ? "opacity-50" : ""
                                            )}
                                            onClick={() => {
                                                if(isLeader || !isGigMode) {
                                                    // If clicking current, just close
                                                    if (isActive) {
                                                        setShowSetSongsDialog(false);
                                                        return;
                                                    }
                                                    // Load ad-hoc (preview mode) from ANY set
                                                    if (item.song) handleAdHocSelect(item.song);
                                                    setShowSetSongsDialog(false);
                                                }
                                            }}
                                          >
                                              <div className="w-6 text-center text-sm text-muted-foreground font-mono">{songIdx + 1}</div>
                                              <div className="flex-1">
                                                  <div className={cn("font-medium", isActive && "text-primary font-bold")}>{item.song?.title}</div>
                                                  <div className="text-xs text-muted-foreground">{item.song?.artist}</div>
                                              </div>
                                              {isActive && <Radio className="h-4 w-4 text-primary animate-pulse" />}
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
              <DialogFooter className="p-2 border-t">
                  <Button variant="ghost" onClick={() => setShowSetSongsDialog(false)} className="w-full">Close</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* Search */}
      <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
        <DialogContent className="max-w-md h-[80vh] flex flex-col p-0 gap-0">
            <div className="p-4 border-b bg-muted/20">
                <Input placeholder="Search song..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus />
            </div>
            <ScrollArea className="flex-1">
                <div className="divide-y">
                    {filteredSongs.map(song => (
                        <div key={song.id} className="p-4 hover:bg-accent cursor-pointer" onClick={() => handleAdHocSelect(song)}>
                            <div className="font-medium">{song.title}</div>
                            <div className="text-sm text-muted-foreground">{song.artist}</div>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Skipped Songs Dialog */}
      <Dialog open={showSkippedSongs} onOpenChange={setShowSkippedSongs}>
          <DialogContent className="max-w-md h-[60vh] flex flex-col p-0 gap-0">
              <DialogHeader className="px-6 py-4 border-b">
                  <DialogTitle>Skipped Songs</DialogTitle>
                  <DialogDescription>Select a song to play it now (as ad-hoc).</DialogDescription>
              </DialogHeader>
              <ScrollArea className="flex-1">
                  <div className="divide-y">
                      {skippedSongs.map(song => (
                          <div key={song.id} className="p-4 hover:bg-accent cursor-pointer flex items-center justify-between group" onClick={() => handleRestoreSkippedSong(song)}>
                              <div>
                                  <div className="font-medium">{song.title}</div>
                                  <div className="text-sm text-muted-foreground">{song.artist}</div>
                              </div>
                              <Radio className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100" />
                          </div>
                      ))}
                  </div>
              </ScrollArea>
          </DialogContent>
      </Dialog>

      {/* Leader Exit Dialog */}
      <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>End Performance Session?</DialogTitle>
                  <DialogDescription>
                      You are the leader of this session.
                  </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-2">
                  <div className="rounded-lg border p-4 bg-muted/20">
                      <h4 className="font-semibold mb-2">Option 1: Transfer Leadership</h4>
                      <p className="text-sm text-muted-foreground mb-3">Select another user to take over, then you will leave the session.</p>
                      
                      <div className="space-y-2 max-h-[150px] overflow-y-auto">
                          {participants.filter(p => p.user_id !== userId).map(p => (
                              <div key={p.id} className="flex items-center justify-between p-2 bg-background border rounded cursor-pointer hover:bg-accent" onClick={() => handleTransferAndLeave(p.user_id)}>
                                  <span className="text-sm">{p.profile?.first_name} {p.profile?.last_name}</span>
                                  <Crown className="h-3 w-3 text-muted-foreground" />
                              </div>
                          ))}
                          {participants.length <= 1 && (
                              <div className="text-sm italic text-muted-foreground">No other participants available.</div>
                          )}
                      </div>
                  </div>

                  <Button variant="destructive" className="w-full" onClick={handleEndSession}>
                      Option 2: End Session for Everyone
                  </Button>
              </div>
              
              <DialogFooter>
                  <Button variant="ghost" onClick={() => setShowExitConfirm(false)}>Cancel</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* Leadership Request from Follower */}
      <AlertDialog open={!!incomingRequest} onOpenChange={() => {}}>
          <AlertDialogContent>
              <AlertDialogHeader>
                  <AlertDialogTitle>Leadership Request</AlertDialogTitle>
                  <AlertDialogDescription>
                      <span className="font-bold text-foreground">{incomingRequest?.userName}</span> wants to take control of the session.
                  </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => handleResolveRequest(false)}>Deny</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleResolveRequest(true)}>Approve</AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showLeaderRequest} onOpenChange={setShowLeaderRequest}>
          <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Take Control?</AlertDialogTitle><AlertDialogDescription>This will send a request to the current leader. If they are inactive for 30s, you will be promoted automatically.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRequestLeadership}>Send Request</AlertDialogAction>
              </AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PerformanceMode;