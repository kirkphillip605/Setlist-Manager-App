import AppLayout from "@/components/AppLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CalendarDays, ChevronRight, Music2, Users, Lock, Plus, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSyncedSetlists, useSyncedGigs, useSyncAfterMutation } from "@/hooks/useSyncedData";
import { PerformanceSessionDialog } from "@/components/PerformanceSessionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSetlist } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useBand } from "@/context/BandContext";

const PerformanceSelection = () => {
  const navigate = useNavigate();
  const isOnline = useNetworkStatus();
  const queryClient = useQueryClient();
  const { activeBandId } = useBand();
  const syncAfterMutation = useSyncAfterMutation();
  const [mode, setMode] = useState<"gig" | "practice" | null>(null);
  
  // Session Init State
  const [selectedGig, setSelectedGig] = useState<any>(null);

  // Setlist Creation State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newListName, setNewListName] = useState("");

  const { data: setlists = [] } = useSyncedSetlists();
  const { data: gigs = [] } = useSyncedGigs();

  // Filter Gigs: Today and Future
  const upcomingGigs = gigs.filter(g => new Date(g.start_time) >= new Date(new Date().setDate(new Date().getDate() - 1)));

  const handleGigSelect = (gig: any) => {
    if (!gig.setlist_id) {
        toast.error("This gig has no setlist attached!");
        return;
    }
    // Open session dialog instead of navigating immediately
    setSelectedGig(gig);
  };

  const handleSessionJoin = (role: string, sessionId: string) => {
      let url = `/performance/${selectedGig.setlist_id}?gigId=${selectedGig.id}`;
      if (role === 'standalone') {
          url += '&standalone=true';
      }
      navigate(url);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
       return createSetlist(activeBandId!, newListName, true, false);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['setlists'] });
      syncAfterMutation();
      setNewListName("");
      setIsCreateOpen(false);
      setMode(null);
      if (data?.id) navigate(`/setlists/${data.id}`);
    },
    onError: () => toast.error("Failed to create setlist")
  });

  return (
    <AppLayout>
      <div className="space-y-8 pb-20 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Performance Mode</h1>
          <p className="text-muted-foreground text-lg">Choose your mode to begin.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <Card 
                className="cursor-pointer hover:border-primary hover:bg-primary/5 transition-all group border-2"
                onClick={() => setMode("gig")}
            >
                <CardHeader className="text-center pb-2">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <CalendarDays className="w-8 h-8" />
                    </div>
                    <CardTitle className="text-2xl">Start Gig</CardTitle>
                </CardHeader>
                <CardContent className="text-center text-muted-foreground px-6 pb-6">
                    Play an upcoming show. Optimized for live performance with setlist management.
                </CardContent>
            </Card>

            <Card 
                className="cursor-pointer hover:border-secondary hover:bg-secondary/20 transition-all group border-2"
                onClick={() => setMode("practice")}
            >
                <CardHeader className="text-center pb-2">
                    <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4 text-foreground group-hover:bg-secondary-foreground group-hover:text-secondary transition-colors">
                        <Music2 className="w-8 h-8" />
                    </div>
                    <CardTitle className="text-2xl">Start Practice</CardTitle>
                </CardHeader>
                <CardContent className="text-center text-muted-foreground px-6 pb-6">
                    Rehearse any setlist from your library. Includes metronome and editing tools.
                </CardContent>
            </Card>
        </div>

        {/* Selection Dialog */}
        <Dialog open={!!mode} onOpenChange={() => setMode(null)}>
            <DialogContent className="max-w-md h-[60vh] flex flex-col p-0 gap-0 overflow-hidden sm:rounded-xl">
                <DialogHeader className="px-6 py-4 border-b bg-muted/40 shrink-0">
                    <DialogTitle className="text-xl font-bold tracking-tight">
                        {mode === "gig" ? "Select Gig" : "Select Setlist"}
                    </DialogTitle>
                </DialogHeader>
                
                <ScrollArea className="flex-1 bg-background/50">
                    <div className="divide-y">
                        {mode === "gig" ? (
                             upcomingGigs.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground">No upcoming gigs found.</div>
                             ) : (
                                upcomingGigs.map(gig => (
                                    <div 
                                        key={gig.id} 
                                        className="p-4 hover:bg-primary/5 cursor-pointer flex items-center justify-between group transition-colors"
                                        onClick={() => handleGigSelect(gig)}
                                    >
                                        <div>
                                            <div className="font-bold text-base">{gig.name}</div>
                                            <div className="text-sm text-muted-foreground flex items-center gap-2">
                                                <CalendarDays className="w-3 h-3" />
                                                {new Date(gig.start_time).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                                    </div>
                                ))
                             )
                        ) : (
                            <div>
                                {setlists.length === 0 && (
                                    <div className="p-8 text-center text-muted-foreground">No setlists found.</div>
                                )}
                                
                                {setlists.sort((a,b) => a.name.localeCompare(b.name)).map(list => (
                                    <div 
                                        key={list.id} 
                                        className="p-4 hover:bg-secondary/20 cursor-pointer flex items-center justify-between group transition-colors"
                                        onClick={() => navigate(`/performance/${list.id}`)}
                                    >
                                        <div>
                                            <div className="font-bold text-base flex items-center gap-2">
                                                {list.is_personal ? <Lock className="w-3.5 h-3.5 text-muted-foreground" /> : <Users className="w-3.5 h-3.5 text-muted-foreground" />}
                                                {list.name}
                                            </div>
                                            <div className="text-xs text-muted-foreground flex gap-2 mt-1 pl-6">
                                                {list.sets.reduce((acc, s) => acc + s.songs.length, 0)} Songs
                                            </div>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    </div>
                                ))}

                                {/* Create Button */}
                                {isOnline && (
                                    <div className="p-4 border-t bg-muted/10 sticky bottom-0 backdrop-blur-sm">
                                        <Button 
                                            variant="outline" 
                                            className="w-full justify-start gap-2 h-12 text-primary border-primary/20 hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-all"
                                            onClick={() => setIsCreateOpen(true)}
                                        >
                                            <Plus className="h-5 w-5" /> Create New Setlist...
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>

        {/* Create Setlist Dialog */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New Personal Setlist</DialogTitle>
                    <DialogDescription>Create a new list for practice.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Name</Label>
                        <Input 
                            value={newListName} 
                            onChange={e => setNewListName(e.target.value)} 
                            placeholder="e.g. My Practice List" 
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button onClick={() => createMutation.mutate()} disabled={!newListName.trim() || createMutation.isPending}>
                            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Create & Edit
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>

        {/* Gig Session Dialog */}
        <PerformanceSessionDialog 
            open={!!selectedGig}
            gigId={selectedGig?.id || null}
            gigName={selectedGig?.name || ""}
            onClose={() => setSelectedGig(null)}
            onJoin={handleSessionJoin}
        />
      </div>
    </AppLayout>
  );
};

export default PerformanceSelection;