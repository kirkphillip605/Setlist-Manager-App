import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { deleteSong, saveSong, getSongUsage } from "@/lib/api";
import { useNavigate, useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMetronome } from "@/components/MetronomeContext";
import { useAuth } from "@/context/AuthContext";
import { useBand } from "@/context/BandContext";
import { useEffect, useState, useRef } from "react";
import { searchMusic, fetchAudioFeatures } from "@/lib/musicApi";
import { motion } from "framer-motion";
import { 
  ChevronLeft, 
  Edit, 
  Music2, 
  Timer, 
  StickyNote,
  Loader2,
  ExternalLink,
  Music,
  Square,
  Play,
  Wand2,
  AlertTriangle,
  Eye,
  EyeOff,
  Archive
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useSongFromCache } from "@/hooks/useSyncedData";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { AlbumArtwork } from "@/components/AlbumArtwork";

const SongDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOnline = useNetworkStatus();
  const { openMetronome, closeMetronome, isPlaying, bpm, isOpen } = useMetronome();
  
  const { isAdmin } = useAuth();
  const { activeBandId } = useBand();
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Safe Delete State
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [usageData, setUsageData] = useState<{setlistName: string, date?: string}[]>([]);
  const [isCheckingUsage, setIsCheckingUsage] = useState(false);

  // BPM Monitoring State
  const [showBpmDialog, setShowBpmDialog] = useState(false);
  const [initialBpm, setInitialBpm] = useState<number | null>(null);
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null);
  const wasMetronomeOpen = useRef(false);


  // Use cached song data instead of network request
  const song = useSongFromCache(id);

  // Monitor BPM changes
  useEffect(() => {
    if (isOpen && !wasMetronomeOpen.current) {
        // Just opened
        wasMetronomeOpen.current = true;
        if (song?.tempo) setInitialBpm(parseInt(song.tempo));
    } 
    else if (!isOpen && wasMetronomeOpen.current) {
        // Just closed
        wasMetronomeOpen.current = false;
        
        // If we have a song tempo, and the metronome BPM is different
        // OR if we don't have a song tempo and one was set on metronome
        const currentMetronomeBpm = bpm;
        const songBpm = song?.tempo ? parseInt(song.tempo) : null;

        if (songBpm !== currentMetronomeBpm && isOnline) {
            setDetectedBpm(currentMetronomeBpm);
            setShowBpmDialog(true);
        }
    }
  }, [isOpen, bpm, song, isOnline]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSong(activeBandId!, id),
    onSuccess: () => {
      toast.success("Song deleted");
      queryClient.invalidateQueries({ queryKey: ['songs'] });
      navigate("/songs");
    },
    onError: () => {
      toast.error("Failed to delete song");
    }
  });

  const updateSongMutation = useMutation({
    mutationFn: (song: Partial<import('@/types').Song>) => saveSong(activeBandId!, song),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['songs'] });
        toast.success("Song updated");
        setIsSearchOpen(false);
        setShowBpmDialog(false);
    }
  });

  const initiateDelete = async () => {
    if (!id || !isOnline) return;
    setIsCheckingUsage(true);
    setShowDeleteDialog(true);
    try {
        const usage = await getSongUsage(activeBandId!, id!);
        setUsageData(usage);
    } catch (error) {
        console.error("Failed to check usage", error);
    } finally {
        setIsCheckingUsage(false);
    }
  };

  const toggleRetired = (checked: boolean) => {
    if (!song || !isOnline) return;
    updateSongMutation.mutate({ ...song, is_retired: checked });
  };

  const saveBpm = () => {
      if (!song || !detectedBpm || !isOnline) return;
      updateSongMutation.mutate({ ...song, tempo: detectedBpm.toString() });
  };

  const toggleMetronome = () => {
    if (isPlaying) {
      closeMetronome();
    } else {
      if (song?.tempo) {
        const bpmVal = parseInt(song.tempo);
        if (!isNaN(bpmVal)) {
          openMetronome(bpmVal);
          toast.success(`Metronome started at ${bpmVal} BPM`);
        } else {
          toast.error("Invalid tempo format");
        }
      } else {
        openMetronome(120); // Default
        toast.info("No tempo set. Started at 120 BPM.");
      }
    }
  };

  const handleFetchDetails = async () => {
    if (!song || !isOnline) return;
    setIsFetchingDetails(true);
    try {
        const results = await searchMusic(`${song.artist} ${song.title}`);
        if (results.length === 0) {
            toast.error("No matches found on Spotify");
        } else {
            setSearchResults(results);
            setIsSearchOpen(true);
        }
    } catch (error) {
        toast.error("Search failed");
    } finally {
        setIsFetchingDetails(false);
    }
  };

  const confirmMatch = async (result: any) => {
      if (!song || !isOnline) return;
      setIsFetchingDetails(true);
      const toastId = toast.loading("Fetching audio features...");
      
      try {
        const features = await fetchAudioFeatures(result.id);
        
        const updates: any = {
            id: song.id,
            spotify_url: result.spotifyUrl || song.spotify_url,
            cover_url: result.coverUrl || song.cover_url,
        };

        if (features.key) updates.key = features.key;
        if (features.tempo) updates.tempo = features.tempo;
        if (result.duration) updates.duration = result.duration;
        
        updateSongMutation.mutate(updates);
        toast.dismiss(toastId);
      } catch (error) {
          toast.error("Failed to fetch details", { id: toastId });
      } finally {
          setIsFetchingDetails(false);
      }
  };

  if (!song) return (
    <AppLayout>
      <div className="text-center p-8">Song not found</div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <motion.div 
        className="space-y-6 pb-20"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/songs")}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold tracking-tight truncate max-w-[200px] sm:max-w-md">
              {song.title}
            </h1>
            {song.is_retired && (
                <span className="bg-muted text-muted-foreground text-xs px-2 py-1 rounded font-medium border">RETIRED</span>
            )}
          </div>
          <div className="flex gap-2">
            {isAdmin && isOnline && (
                <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleFetchDetails} 
                    disabled={isFetchingDetails}
                    title="Auto-fetch Key & Tempo"
                >
                    {isFetchingDetails ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                </Button>
            )}
            
            {isOnline && (
                <Button asChild variant="outline" size="icon">
                <Link to={`/songs/${id}/edit`}>
                    <Edit className="h-4 w-4" />
                </Link>
                </Button>
            )}
          </div>
        </div>

        {/* Hero Section with Art */}
        <div className={`flex flex-col sm:flex-row gap-6 items-start ${song.is_retired ? 'opacity-75 grayscale' : ''}`}>
          <motion.div 
            className="shrink-0 mx-auto sm:mx-0"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.3 }}
          >
             {/* Improved Artwork Handling */}
             {isOnline ? (
               <div className="w-48 h-48 relative">
                 <AlbumArtwork 
                    src={song.cover_url} 
                    alt={song.title} 
                    className="rounded-lg shadow-md"
                    containerClassName="w-full h-full rounded-lg shadow-md"
                 />
               </div>
             ) : (
               <div className="w-48 h-48 rounded-lg shadow-md bg-secondary flex items-center justify-center">
                 <Music className="w-16 h-16 text-muted-foreground opacity-50" />
               </div>
             )}
          </motion.div>

          <div className="flex-1 w-full space-y-4">
             <div className="text-center sm:text-left">
               <h2 className="text-2xl font-semibold">{song.title}</h2>
               <p className="text-lg text-muted-foreground">{song.artist}</p>
             </div>
             
             {/* Action Buttons - Grid on mobile, Flex on desktop */}
             <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-3">
               {isOnline && song.spotify_url && (
                 <Button asChild variant="outline" className="w-full sm:w-auto gap-2 text-[#1DB954] hover:text-[#1DB954] border-[#1DB954]/20 hover:bg-[#1DB954]/10">
                   <a href={song.spotify_url} target="_blank" rel="noopener noreferrer">
                     <Music className="w-4 h-4" />
                     Open in Spotify
                     <ExternalLink className="w-3 h-3 ml-1" />
                   </a>
                 </Button>
               )}
               
               <Button 
                onClick={toggleMetronome} 
                variant={isPlaying ? "destructive" : "outline"} 
                className="w-full sm:w-auto gap-2"
               >
                  {isPlaying ? (
                    <>
                      <Square className="w-4 h-4 fill-current" />
                      Stop Metronome
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      Start Metronome
                    </>
                  )}
               </Button>
             </div>

             <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                <Card className="p-3 flex flex-col items-center text-center bg-secondary/10">
                  <div className="flex items-center gap-1 mb-1">
                    <Music2 className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground uppercase">Key</span>
                  </div>
                  <span className="font-semibold">{song.key || "-"}</span>
                </Card>
                
                <Card className="p-3 flex flex-col items-center text-center bg-secondary/10">
                   <div className="flex items-center gap-1 mb-1">
                    <Timer className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground uppercase">Tempo</span>
                  </div>
                  <span className="font-semibold">{song.tempo ? `${song.tempo} BPM` : "-"}</span>
                </Card>

                <Card className="p-3 flex flex-col items-center text-center bg-secondary/10 col-span-2 sm:col-span-1">
                  <div className="flex items-center gap-1 mb-1">
                    <StickyNote className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground uppercase">Note</span>
                  </div>
                  <span className="font-semibold truncate w-full" title={song.note || ""}>{song.note || "-"}</span>
                </Card>
             </div>
          </div>
        </div>

        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.2, duration: 0.4 }}
        >
          <Card className="min-h-[400px] p-8 bg-card relative">
            {song.lyrics ? (
              <div className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                {song.lyrics}
              </div>
            ) : (
              <div className="text-muted-foreground italic">No lyrics/chords added.</div>
            )}
          </Card>
        </motion.div>

        {/* Danger Zone - Only Online */}
        {isOnline && (
            <Card className="border-destructive/30 bg-destructive/5 mt-8 overflow-hidden">
                <CardHeader className="border-b border-destructive/10 bg-destructive/10 py-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-4 w-4" /> Danger Zone
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <h4 className="font-medium flex items-center gap-2">
                                {song.is_retired ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                {song.is_retired ? "Re-activate Song" : "Retire Song"}
                            </h4>
                            <p className="text-sm text-muted-foreground mt-1">
                                {song.is_retired 
                                    ? "Make this song active again. It will appear in new setlist searches." 
                                    : "Retired songs remain in existing setlists but cannot be added to new ones."}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Label htmlFor="retire-mode" className="text-sm">
                                {song.is_retired ? "Retired" : "Active"}
                            </Label>
                            <Switch 
                                id="retire-mode"
                                checked={song.is_retired || false}
                                onCheckedChange={toggleRetired}
                            />
                        </div>
                    </div>
                    
                    <div className="h-px bg-destructive/10 w-full" />

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <h4 className="font-medium text-destructive">Delete Song</h4>
                            <p className="text-sm text-muted-foreground mt-1">
                                Permanently remove this song from the database. This action cannot be undone.
                            </p>
                        </div>
                        <Button variant="destructive" onClick={initiateDelete}>
                            Delete Permanently
                        </Button>
                    </div>
                </CardContent>
            </Card>
        )}

        {/* Admin Search Dialog */}
        <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Select Match</DialogTitle>
                    <DialogDescription>
                        Choose the correct Spotify track to update Key, Tempo, and Cover Art.
                    </DialogDescription>
                </DialogHeader>
                <div className="max-h-[300px] overflow-y-auto space-y-2">
                    {searchResults.map(result => (
                        <div 
                            key={result.id} 
                            className="flex items-center gap-3 p-2 hover:bg-accent rounded cursor-pointer"
                            onClick={() => confirmMatch(result)}
                        >
                             <div className="w-10 h-10 shrink-0">
                                <AlbumArtwork 
                                    src={result.coverUrl} 
                                    alt={result.title} 
                                    containerClassName="w-full h-full rounded"
                                />
                             </div>
                             <div className="overflow-hidden">
                                 <p className="font-medium truncate">{result.title}</p>
                                 <p className="text-xs text-muted-foreground truncate">{result.artist}</p>
                             </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>

         {/* Safe Delete Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
                        Delete "{song.title}"?
                    </AlertDialogTitle>
                    <div className="text-sm text-muted-foreground space-y-4 pt-2">
                        {isCheckingUsage ? (
                            <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" /> Checking usage...
                            </div>
                        ) : usageData.length > 0 ? (
                            <>
                                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-600 dark:text-amber-400">
                                    <p className="font-semibold mb-1">Warning: Active in {usageData.length} Setlist{usageData.length !== 1 ? 's' : ''}</p>
                                    <p>Deleting this song will remove it from these setlists:</p>
                                </div>
                                <ScrollArea className="h-24 rounded border p-2">
                                    <ul className="list-disc list-inside space-y-1">
                                        {usageData.map((usage, idx) => (
                                            <li key={idx}>
                                                <span className="font-medium">{usage.setlistName}</span> 
                                                <span className="text-xs text-muted-foreground ml-2">({usage.date})</span>
                                            </li>
                                        ))}
                                    </ul>
                                </ScrollArea>
                                <p>
                                    Consider <b>Retiring</b> the song instead. Retired songs remain in existing setlists but cannot be added to new ones.
                                </p>
                            </>
                        ) : (
                            <p>
                                This will permanently delete this song from your repertoire. This action cannot be undone.
                            </p>
                        )}
                    </div>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    
                    {!isCheckingUsage && usageData.length > 0 && (
                        <Button 
                            variant="secondary" 
                            onClick={() => {
                                toggleRetired(true);
                                setShowDeleteDialog(false);
                                toast.success("Song retired instead of deleted");
                            }}
                            className="w-full sm:w-auto"
                        >
                            <Archive className="mr-2 h-4 w-4" /> Retire Instead
                        </Button>
                    )}
                    
                    <Button 
                        variant="destructive"
                        onClick={() => deleteMutation.mutate(id!)}
                        className="w-full sm:w-auto"
                        disabled={isCheckingUsage}
                    >
                        {usageData.length > 0 ? "Delete Anyway" : "Delete Permanently"}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {/* BPM Update Dialog */}
        <AlertDialog open={showBpmDialog} onOpenChange={setShowBpmDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Update Song Tempo?</AlertDialogTitle>
                    <AlertDialogDescription>
                        You changed the metronome to <b>{detectedBpm} BPM</b>. Would you like to save this new tempo to the song (was {song.tempo || "unset"})?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setShowBpmDialog(false)}>No, Keep Old</AlertDialogCancel>
                    <AlertDialogAction onClick={saveBpm}>Yes, Update Song</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

      </motion.div>
    </AppLayout>
  );
};

export default SongDetail;