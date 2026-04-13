import AppLayout from "@/components/AppLayout";
import { Loader2, CloudOff, Save, Undo, Plus, Star, Clock, Trash2, Lock } from "lucide-react";
import { syncSetlist } from "@/lib/api";
import { useBand } from "@/context/BandContext";
import { parseDurationToSeconds, formatDurationRounded } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useImmer } from "use-immer";

import { SetlistHeader } from "@/components/SetlistHeader";
import { SetCard } from "@/components/SetCard";
import { AddSongDialog } from "@/components/AddSongDialog";
import { useSetlistWithSongs, useSyncedSongs, useSyncAfterMutation } from "@/hooks/useSyncedData";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { Setlist, Set as SetType, SetSong } from "@/types";
import { LoadingDialog } from "@/components/LoadingDialog";
import { useAuth } from "@/context/AuthContext";

// Helper to deep clone setlist for state
const cloneSetlistData = (data: Setlist): Setlist => JSON.parse(JSON.stringify(data));

const SetlistDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOnline = useNetworkStatus();
  const syncAfterMutation = useSyncAfterMutation();
  const { canEditSetlist } = useAuth();
  const { activeBandId } = useBand();
  
  // -- Data Fetching --
  const fetchedSetlist = useSetlistWithSongs(id);
  const { data: availableSongs = [] } = useSyncedSongs();

  // -- Local Editor State --
  const [localSetlist, updateLocalSetlist] = useImmer<Setlist | null>(null);
  
  // Undo/History
  const [history, setHistory] = useState<Setlist[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [collapsedSets, setCollapsedSets] = useState<Record<string, boolean>>({});

  // -- UI State --
  const [isAddSongOpen, setIsAddSongOpen] = useState(false);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [setToDelete, setSetToDelete] = useState<string | null>(null);
  const [songToRemove, setSongToRemove] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  
  // Auto-scroll target
  const [scrollToSetId, setScrollToSetId] = useState<string | null>(null);

  const canEdit = localSetlist ? canEditSetlist(localSetlist) : false;

  // Initialize Local State from Cache
  useEffect(() => {
      if (fetchedSetlist && !initialized) {
          updateLocalSetlist(cloneSetlistData(fetchedSetlist));
          setInitialized(true);
      }
  }, [fetchedSetlist, initialized, updateLocalSetlist]);

  // -- Auto Scroll Effect --
  useEffect(() => {
      if (scrollToSetId) {
          const timer = setTimeout(() => {
              const element = document.getElementById(`set-${scrollToSetId}`);
              if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
              setScrollToSetId(null);
          }, 100); 
          return () => clearTimeout(timer);
      }
  }, [scrollToSetId]);

  // -- Navigation Blocking --
  useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
          if (isDirty) {
              e.preventDefault();
              e.returnValue = '';
          }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // -- State Mutators --

  const pushHistory = useCallback(() => {
      if (localSetlist) {
          setHistory(prev => [...prev, JSON.parse(JSON.stringify(localSetlist))].slice(-20)); 
          setIsDirty(true);
      }
  }, [localSetlist]);

  const handleUndo = () => {
      if (history.length === 0) return;
      const previousState = history[history.length - 1];
      updateLocalSetlist(previousState);
      setHistory(prev => prev.slice(0, -1));
      if (history.length === 1) setIsDirty(false); 
      toast.info("Undo successful");
  };

  // --- Actions ---

  const handleUpdateName = (newName: string) => {
      if (!isOnline) { toast.error("Cannot edit while offline"); return; }
      if (!canEdit) return;
      pushHistory();
      updateLocalSetlist(draft => { if (draft) draft.name = newName; });
  };

  const handleAddSet = (isEncore = false) => {
      if (!isOnline) { toast.error("Cannot edit while offline"); return; }
      if (!canEdit) return;
      if (!localSetlist) return;
      pushHistory();

      const newSetId = `temp-set-${Date.now()}`;
      
      updateLocalSetlist(draft => {
          if (!draft) return;
          const currentCount = draft.sets.filter(s => s.name !== "Encore").length;
          const position = draft.sets.length + 1;
          const encoreIndex = draft.sets.findIndex(s => s.name === "Encore");

          if (isEncore) {
              if (encoreIndex !== -1) {
                  toast.error("Encore set already exists.");
                  return;
              }
              draft.sets.push({
                  id: newSetId,
                  name: "Encore",
                  position: position,
                  songs: []
              } as SetType);
          } else {
              const newSet = {
                  id: newSetId,
                  name: `Set ${currentCount + 1}`,
                  position: 0, 
                  songs: []
              } as SetType;

              if (encoreIndex !== -1) {
                  draft.sets.splice(encoreIndex, 0, newSet);
              } else {
                  draft.sets.push(newSet);
              }
          }

          // Re-normalize
          let setCounter = 1;
          draft.sets.forEach((s, i) => {
              s.position = i + 1;
              if (s.name !== "Encore") {
                  s.name = `Set ${setCounter++}`;
              }
          });
      });

      setScrollToSetId(newSetId);
  };

  const handleDeleteSet = (setId: string) => {
      if (!isOnline) { toast.error("Cannot edit while offline"); return; }
      if (!canEdit) return;
      pushHistory();
      updateLocalSetlist(draft => {
          if (!draft) return;
          draft.sets = draft.sets.filter(s => s.id !== setId);
          
          let setCounter = 1;
          draft.sets.forEach((s, i) => {
              s.position = i + 1;
              if (s.name !== "Encore") {
                  s.name = `Set ${setCounter++}`;
              }
          });
      });
      setSetToDelete(null);
  };

  const handleAddSongs = async (targetSetId: string, songIds: string[]) => {
      if (!isOnline) { toast.error("Cannot edit while offline"); return; }
      if (!canEdit) return;
      pushHistory();
      updateLocalSetlist(draft => {
          if (!draft) return;
          const targetSet = draft.sets.find(s => s.id === targetSetId);
          if (!targetSet) return;

          const newSongs = songIds.map((sid, idx) => {
              const songData = availableSongs.find(s => s.id === sid);
              return {
                  id: `temp-song-${Date.now()}-${idx}`,
                  position: targetSet.songs.length + idx + 1,
                  songId: sid,
                  song: songData
              } as SetSong;
          });

          targetSet.songs.push(...newSongs);
      });
  };

  const handleCreateSetAndAdd = async (initialSongs: string[], remainingSongs: string[]) => {
      if (!isOnline) { toast.error("Cannot edit while offline"); return; }
      if (!canEdit) return;
      pushHistory();
      updateLocalSetlist(draft => {
          if (!draft) return;
          
          if (activeSetId && initialSongs.length > 0) {
              const targetSet = draft.sets.find(s => s.id === activeSetId);
              if (targetSet) {
                  const newSongs = initialSongs.map((sid, idx) => ({
                      id: `temp-song-split-a-${idx}`,
                      position: targetSet.songs.length + idx + 1,
                      songId: sid,
                      song: availableSongs.find(s => s.id === sid)
                  } as SetSong));
                  targetSet.songs.push(...newSongs);
              }
          }

          const newSetId = `temp-set-split-${Date.now()}`;
          const encoreIndex = draft.sets.findIndex(s => s.name === "Encore");
          
          const newSet = {
              id: newSetId,
              name: "New Set", 
              position: 0,
              songs: remainingSongs.map((sid, i) => ({
                  id: `temp-song-split-b-${i}`,
                  songId: sid,
                  song: availableSongs.find(s => s.id === sid),
                  position: i + 1
              } as SetSong))
          } as SetType;

          if (encoreIndex !== -1) {
              draft.sets.splice(encoreIndex, 0, newSet);
          } else {
              draft.sets.push(newSet);
          }

          let setCounter = 1;
          draft.sets.forEach((s, i) => {
              s.position = i + 1;
              if (s.name !== "Encore") {
                  s.name = `Set ${setCounter++}`;
              }
          });
      });
  };

  const handleRemoveSong = (songId: string) => {
      if (!isOnline) { toast.error("Cannot edit while offline"); return; }
      if (!canEdit) return;
      pushHistory();
      updateLocalSetlist(draft => {
          if (!draft) return;
          draft.sets.forEach(set => {
              const idx = set.songs.findIndex(s => s.id === songId);
              if (idx !== -1) {
                  set.songs.splice(idx, 1);
                  set.songs.forEach((s, i) => s.position = i + 1);
              }
          });
      });
      setSongToRemove(null);
  };

  const handleMoveOrder = (setId: string, songIndex: number, direction: 'up' | 'down') => {
      if (!isOnline) { toast.error("Cannot edit while offline"); return; }
      if (!canEdit) return;
      pushHistory();
      updateLocalSetlist(draft => {
          if (!draft) return;
          const set = draft.sets.find(s => s.id === setId);
          if (!set) return;

          const swapIndex = direction === 'up' ? songIndex - 1 : songIndex + 1;
          if (swapIndex < 0 || swapIndex >= set.songs.length) return;

          [set.songs[songIndex], set.songs[swapIndex]] = [set.songs[swapIndex], set.songs[songIndex]];
          set.songs.forEach((s, i) => s.position = i + 1);
      });
  };

  const handleMoveToSet = (setSongId: string, targetSetId: string) => {
      if (!isOnline) { toast.error("Cannot edit while offline"); return; }
      if (!canEdit) return;
      pushHistory();
      updateLocalSetlist(draft => {
          if (!draft) return;
          
          let songToMove: SetSong | null = null;
          draft.sets.forEach(set => {
              const idx = set.songs.findIndex(s => s.id === setSongId);
              if (idx !== -1) {
                  songToMove = set.songs[idx];
                  set.songs.splice(idx, 1);
                  set.songs.forEach((s, i) => s.position = i + 1);
              }
          });

          if (songToMove) {
              const target = draft.sets.find(s => s.id === targetSetId);
              if (target) {
                  target.songs.push({ ...songToMove, position: target.songs.length + 1 });
              }
          }
      });
  };

  const toggleSetCollapse = (setId: string) => {
      setCollapsedSets(prev => ({ ...prev, [setId]: !prev[setId] }));
  };

  // --- Stats Calculation ---
  const totalDuration = localSetlist?.sets
    .filter(s => s.name !== "Encore")
    .reduce((total, set) => {
        return total + set.songs.reduce((st, s) => st + parseDurationToSeconds(s.song?.duration), 0);
    }, 0) || 0;

  const hasEncore = localSetlist?.sets.some(s => s.name === "Encore");

  // --- Save / Discard ---

  const saveMutation = useMutation({
      mutationFn: async () => {
          if (!localSetlist) return;
          await syncSetlist(activeBandId!, localSetlist);
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['setlist', id] });
          queryClient.invalidateQueries({ queryKey: ['setlists'] });
          syncAfterMutation();
          setIsDirty(false);
          setHistory([]);
          toast.success("Changes saved successfully");
      },
      onError: (e) => toast.error("Failed to save changes: " + e.message)
  });

  const handleDiscard = () => {
      if (fetchedSetlist) {
          updateLocalSetlist(cloneSetlistData(fetchedSetlist));
          setIsDirty(false);
          setHistory([]);
          setShowDiscardConfirm(false);
          toast.info("Changes discarded");
      }
  };

  // --- Render ---

  useEffect(() => {
    if (!fetchedSetlist) {
      navigate('/', { replace: true });
    }
  }, [fetchedSetlist, navigate]);

  if (!localSetlist) {
    if (!fetchedSetlist) {
      return null;
    }
    return (
      <AppLayout>
        <div className="flex justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <LoadingDialog open={saveMutation.isPending} message="Saving setlist..." />
      <div className="space-y-6 pb-20 relative">
        {!isOnline && (
             <div className="bg-muted px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-sm text-muted-foreground">
                 <CloudOff className="h-4 w-4" /> Offline Mode: Read Only
             </div>
        )}
        {isOnline && !canEdit && (
             <div className="bg-muted px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-sm text-muted-foreground">
                 <Lock className="h-4 w-4" /> View Only (Managed by Admin/Manager)
             </div>
        )}

        {/* Sticky Header with Action Bar */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b shadow-sm -mx-4 px-4 sm:mx-0 sm:px-0 pt-4 pb-3 mb-6 transition-all">
            {canEdit ? (
                <SetlistHeader 
                    name={localSetlist.name}
                    onUpdateName={handleUpdateName}
                >
                    {/* Desktop Buttons */}
                    {isOnline && (
                        <div className="hidden md:flex items-center gap-2">
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleAddSet(false)} 
                                className="h-9 px-3 border border-dashed"
                            >
                                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Set
                            </Button>
                            {!hasEncore && (
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => handleAddSet(true)} 
                                    className="h-9 px-3 border border-dashed text-amber-600 hover:text-amber-700 dark:text-amber-500"
                                >
                                    <Star className="mr-1.5 h-3.5 w-3.5" /> Add Encore
                                </Button>
                            )}
                        </div>
                    )}
                </SetlistHeader>
            ) : (
                <div className="flex items-center gap-2 pb-2">
                    <h1 className="text-2xl font-bold tracking-tight truncate">{localSetlist.name}</h1>
                </div>
            )}
            
            {/* Toolbar Row */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 mt-2">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="flex items-center gap-2 text-sm font-medium bg-secondary/50 px-3 py-1.5 rounded-md">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>{formatDurationRounded(totalDuration)}</span>
                    </div>
                </div>

                {isDirty && isOnline && canEdit && (
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end animate-in fade-in slide-in-from-right-4">
                        <Button variant="outline" size="sm" onClick={handleUndo} disabled={history.length === 0 || saveMutation.isPending}>
                            <Undo className="h-4 w-4 mr-2" /> Undo
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setShowDiscardConfirm(true)} disabled={saveMutation.isPending}>
                            <Trash2 className="h-4 w-4 mr-2" /> Discard
                        </Button>
                        <Button 
                            size="sm" 
                            onClick={() => saveMutation.mutate()} 
                            disabled={saveMutation.isPending}
                            className="bg-green-600 hover:bg-green-700 text-white min-w-[100px]"
                        >
                            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Save
                        </Button>
                    </div>
                )}
            </div>
        </div>

        <div className="space-y-6">
          {localSetlist.sets.length === 0 ? (
             <div className="text-center py-20 border-2 border-dashed rounded-lg bg-muted/10">
                <p className="text-muted-foreground mb-4">No sets added yet.</p>
                {canEdit && <Button onClick={() => handleAddSet(false)} disabled={!isOnline}>Create First Set</Button>}
             </div>
          ) : (
            localSetlist.sets.map((set) => (
                <div key={set.id}>
                   <SetCard 
                       set={set}
                       setlist={localSetlist}
                       setDuration={set.songs.reduce((acc, s) => acc + parseDurationToSeconds(s.song?.duration), 0)}
                       isCollapsed={!!collapsedSets[set.id]}
                       readOnly={!canEdit || !isOnline}
                       onToggleCollapse={() => toggleSetCollapse(set.id)}
                       onAddSong={(setId) => { if(isOnline && canEdit) { setActiveSetId(setId); setIsAddSongOpen(true); }}}
                       onDeleteSet={(setId) => { if(isOnline && canEdit) setSetToDelete(setId); }}
                       onRemoveSong={(songId) => { if(isOnline && canEdit) setSongToRemove(songId); }}
                       onMoveOrder={handleMoveOrder}
                       onMoveToSet={handleMoveToSet}
                   />
               </div>
            ))
          )}
        </div>

        {/* Mobile FAB */}
        {isOnline && canEdit && (
            <div className="md:hidden fixed bottom-24 right-4 z-40">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button 
                            className="rounded-full shadow-xl h-14 w-14 p-0 bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                            <Plus className="h-8 w-8" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top" className="w-48 mb-2">
                        <DropdownMenuItem onClick={() => handleAddSet(false)} className="py-3 text-base">
                            <Plus className="mr-2 h-4 w-4" /> Create New Set
                        </DropdownMenuItem>
                        {!hasEncore && (
                            <DropdownMenuItem onClick={() => handleAddSet(true)} className="py-3 text-base text-amber-600 focus:text-amber-700">
                                <Star className="mr-2 h-4 w-4" /> Create Encore Set
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        )}

        {isAddSongOpen && isOnline && canEdit && (
            <AddSongDialog 
                open={isAddSongOpen}
                setlist={localSetlist}
                activeSetId={activeSetId}
                availableSongs={availableSongs}
                onClose={() => setIsAddSongOpen(false)}
                onAddSongs={async (target, ids) => handleAddSongs(target, ids)}
                onCreateSetAndAdd={async (a, b) => handleCreateSetAndAdd(a, b)}
            />
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={!!setToDelete} onOpenChange={(open) => !open && setSetToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete Set?</AlertDialogTitle>
                    <AlertDialogDescription>Sets following this one will be renumbered automatically.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => setToDelete && handleDeleteSet(setToDelete)} className="bg-destructive hover:bg-destructive/90">Delete Set</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {/* Remove Song Confirmation */}
        <AlertDialog open={!!songToRemove} onOpenChange={(open) => !open && setSongToRemove(null)}>
            <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Remove Song?</AlertDialogTitle></AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => songToRemove && handleRemoveSong(songToRemove)}>Remove</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {/* Discard Changes Confirmation */}
        <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Discard Changes?</AlertDialogTitle>
                    <AlertDialogDescription>
                        You have unsaved changes. Are you sure you want to discard them and revert to the last saved version?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Keep Editing</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDiscard} className="bg-destructive hover:bg-destructive/90">Discard Changes</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
};

export default SetlistDetail;