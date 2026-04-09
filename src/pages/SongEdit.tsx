import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { SongFormFields } from "@/components/SongFormFields";
import { saveSong } from "@/lib/api";
import { useBand } from "@/context/BandContext";
import { searchMusic, fetchLyrics, fetchAudioFeatures, MusicResult } from "@/lib/musicApi";
import { Song } from "@/types";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Save, Search, Music, Loader2, ArrowRight, CloudOff } from "lucide-react";
import { useSongFromCache } from "@/hooks/useData";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { LoadingDialog } from "@/components/LoadingDialog";
import { AlbumArtwork } from "@/components/AlbumArtwork";

const SongEdit = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isOnline = useNetworkStatus();
  const { activeBandId } = useBand();
  
  // Logic: If no ID, we are adding. If ID, we are editing.
  // If Adding and Offline -> Block (Can't search spotify, can't sync).
  // If Editing and Offline -> Allow viewing form, disable Save.
  
  const [mode, setMode] = useState<'search' | 'edit'>(id ? 'edit' : 'search');
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchResults, setSearchResults] = useState<MusicResult[]>([]);
  
  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors },
  } = useForm<Song>();

  // Watch cover_url to show preview
  const coverUrl = watch("cover_url");

  // Use the cached song data (Master Catalog) instead of a fresh fetch
  const song = useSongFromCache(id);

  useEffect(() => {
    if (song) {
      reset(song);
      setMode('edit');
    }
  }, [song, reset]);

  const saveMutation = useMutation({
    mutationFn: (song: Partial<Song>) => saveSong(activeBandId!, song),
    onSuccess: () => {
      toast.success(id ? "Song updated!" : "Song added!");
      queryClient.invalidateQueries({ queryKey: ['songs'] });
      navigate("/songs");
    },
    onError: (error) => {
      console.error(error);
      toast.error("Failed to save song");
    }
  });

  const onSubmit = (data: Song) => {
    if (!isOnline) {
      toast.error("You are offline. Cannot save changes.");
      return;
    }
    saveMutation.mutate(data);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isOnline) {
        toast.error("Offline: Cannot search Spotify.");
        return;
    }
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await searchMusic(searchQuery);
      setSearchResults(results);
      if (results.length === 0) {
        toast.info("No matches found. Try a different search.");
      }
    } catch (error) {
      toast.error("Failed to search songs");
    } finally {
      setIsSearching(false);
    }
  };

  const selectSong = async (result: MusicResult) => {
    setIsProcessing(true);
    const toastId = toast.loading("Fetching details...");
    
    try {
      // Parallel Fetch: Lyrics and Audio Features
      const [lyrics, features] = await Promise.all([
        fetchLyrics(result.artist, result.title),
        fetchAudioFeatures(result.id)
      ]);

      const newSongData: Partial<Song> = {
        id: "", // Empty ID for new song
        title: result.title,
        artist: result.artist,
        cover_url: result.coverUrl,
        spotify_url: result.spotifyUrl,
        lyrics: lyrics || "",
        key: features.key || "",
        tempo: features.tempo || "",
        duration: features.duration || result.duration || "", 
        note: ""
      };

      reset(newSongData as Song);
      toast.success("Song details loaded", { id: toastId });
      setMode('edit');
    } catch (error) {
      console.error("Error in selectSong:", error);
      toast.error("Error fetching details", { id: toastId });
      setMode('edit'); 
    } finally {
      setIsProcessing(false);
    }
  };

  const renderSearch = () => (
    <div className="space-y-6 max-w-2xl mx-auto">
       <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Add New Song</h2>
        <p className="text-muted-foreground">Search Spotify to auto-fill details or skip to manual entry.</p>
      </div>

      {!isOnline && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg flex items-center justify-center gap-2">
              <CloudOff className="h-5 w-5" />
              <span>You are offline. Cannot search for new songs.</span>
          </div>
      )}

      <Card className={!isOnline ? "opacity-50 pointer-events-none" : ""}>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              placeholder="Search by Artist or Title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={isSearching || isProcessing}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {searchResults.map((result) => (
          <Card 
            key={result.id} 
            className={`hover:bg-accent cursor-pointer transition-colors ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
            onClick={() => selectSong(result)}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 shrink-0">
                    <AlbumArtwork 
                        src={result.coverUrl} 
                        alt="Album Art" 
                        containerClassName="w-full h-full rounded shadow-sm"
                    />
                </div>
                <div>
                  <p className="font-medium">{result.title}</p>
                  <p className="text-sm text-muted-foreground">{result.artist}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" disabled={isProcessing}>
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Select"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="text-center pt-4">
        <Button variant="link" onClick={() => setMode('edit')} disabled={isProcessing}>
          Skip to manual entry <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <AppLayout>
      <LoadingDialog open={saveMutation.isPending} />
      <div className="space-y-6 pb-20">
        {mode === 'edit' && (
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => {
              if (!id) setMode('search'); 
              else navigate(-1);
            }}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {id ? "Edit Song" : "Song Details"}
              </h1>
            </div>
          </div>
        )}

        {mode === 'search' ? (
          renderSearch()
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-w-2xl">
            {/* Hidden fields for extra data */}
            <input type="hidden" {...register("cover_url")} />
            <input type="hidden" {...register("spotify_url")} />

            {/* Album Art Preview in Edit Mode */}
            {coverUrl && (
              <div className="flex items-center gap-4 p-4 border rounded-lg bg-secondary/10">
                <div className="w-16 h-16 shrink-0">
                    <AlbumArtwork 
                        src={coverUrl} 
                        alt="Album Art" 
                        containerClassName="w-full h-full rounded shadow-sm"
                    />
                </div>
                <div>
                  <p className="text-sm font-medium">Album Artwork</p>
                  <p className="text-xs text-muted-foreground">Automatically imported from Spotify</p>
                </div>
              </div>
            )}

            <SongFormFields register={register} errors={errors} control={control} />
            
            <div className="flex gap-4">
              <Button type="submit" className="w-full sm:w-auto" disabled={saveMutation.isPending || !isOnline}>
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {!isOnline && <CloudOff className="mr-2 h-4 w-4" />}
                <Save className="mr-2 h-4 w-4" />
                {isOnline ? "Save Song" : "Offline"}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
};

export default SongEdit;