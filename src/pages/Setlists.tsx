import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuRadioGroup, DropdownMenuRadioItem
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription
} from "@/components/ui/alert-dialog";
import { createSetlist, deleteSetlist, cloneSetlist, getSetlistUsage, convertSetlistToBand } from "@/lib/api";
import { 
  Plus, Trash2, Loader2, Copy, MoreVertical, 
  Lock, Globe, Filter, AlertTriangle, Users, CloudOff, RefreshCw, Printer
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Gig, Setlist } from "@/types";
import { useSyncedSetlists, useSyncAfterMutation } from "@/hooks/useSyncedData";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { LoadingDialog } from "@/components/LoadingDialog";
import { useAuth } from "@/context/AuthContext";
import { useBand } from "@/context/BandContext";
import { SetlistPrintDialog } from "@/components/SetlistPrintDialog";

const Setlists = () => {
  const navigate = useNavigate();
  const isOnline = useNetworkStatus();
  const { canEditSetlist } = useAuth();
  const { activeBandId } = useBand();
  const [activeTab, setActiveTab] = useState("public");
  const [sortBy, setSortBy] = useState<"name" | "created" | "updated">("name");
  
  // Create Form State
  const [isTypeSelectionOpen, setIsTypeSelectionOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"public" | "personal" | "clone">("public");
  const [sourceSetlistId, setSourceSetlistId] = useState("");
  const [cloneType, setCloneType] = useState<"public" | "personal">("personal");
  
  const [newListName, setNewListName] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  // Conversion / Deletion / Printing
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [convertId, setConvertId] = useState<string | null>(null);
  const [printSetlist, setPrintSetlist] = useState<Setlist | null>(null);
  const [usageData, setUsageData] = useState<Gig[]>([]);
  const [isCheckingUsage, setIsCheckingUsage] = useState(false);

  const queryClient = useQueryClient();
  const syncAfterMutation = useSyncAfterMutation();
  
  // Use Synced Hook
  const { data: setlists = [], isLoading } = useSyncedSetlists();

  const filteredSetlists = useMemo(() => {
    let list = activeTab === "public" ? setlists.filter(l => !l.is_personal) : setlists.filter(l => l.is_personal);
    
    // Sort
    return list.sort((a, b) => {
        if (a.is_default) return -1;
        if (b.is_default) return 1;

        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'created') return (b.created_at || "").localeCompare(a.created_at || "");
        if (sortBy === 'updated') return (b.updated_at || "").localeCompare(a.updated_at || "");
        return 0;
    });
  }, [setlists, activeTab, sortBy]);

  const hasDefault = useMemo(() => setlists.some(l => l.is_default), [setlists]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const isPersonal = createMode === "personal" || (createMode === "clone" && cloneType === "personal");
      
      if (createMode === "clone") {
         return cloneSetlist(activeBandId!, sourceSetlistId, newListName, isPersonal);
      } else {
         return createSetlist(activeBandId!, newListName, isPersonal, isDefault);
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['setlists'] });
      syncAfterMutation();
      resetForm();
      if (data?.id) navigate(`/setlists/${data.id}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSetlist(activeBandId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setlists'] });
      syncAfterMutation();
      setDeleteId(null);
      setUsageData([]);
      toast.success("Setlist deleted");
    }
  });

  const convertMutation = useMutation({
      mutationFn: (id: string) => convertSetlistToBand(activeBandId!, id),
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['setlists'] });
          syncAfterMutation();
          setConvertId(null);
          toast.success("Setlist converted to Band Setlist");
      }
  });

  const resetForm = () => {
      setNewListName("");
      setIsDefault(false);
      setIsCreateOpen(false);
  };

  const openCreateModal = (mode: "public" | "personal" | "clone", sourceId?: string) => {
      if (!isOnline) {
          toast.error("Offline: Cannot create setlists");
          return;
      }
      setCreateMode(mode);
      if (mode === "clone" && sourceId) {
          setSourceSetlistId(sourceId);
          setCloneType("personal"); // Default to personal copy
          const src = setlists.find(l => l.id === sourceId);
          if (src) setNewListName(`${src.name} (Copy)`);
      }
      setIsCreateOpen(true);
  };

  const handleDeleteRequest = async (id: string) => {
      if (!isOnline) {
          toast.error("Offline: Cannot delete setlists");
          return;
      }
      setDeleteId(id);
      setIsCheckingUsage(true);
      try {
          const usage = await getSetlistUsage(activeBandId!, id);
          setUsageData(usage);
      } catch (e) {
          console.error(e);
      } finally {
          setIsCheckingUsage(false);
      }
  };

  const handleCloneAsBand = (list: Setlist) => {
      setSourceSetlistId(list.id);
      setNewListName(list.name + " (Band)");
      setCreateMode("clone");
      setCloneType("public");
      setIsCreateOpen(true);
  };

  return (
    <AppLayout>
      <LoadingDialog 
        open={createMutation.isPending || deleteMutation.isPending || convertMutation.isPending} 
        message={
            createMutation.isPending ? "Creating setlist..." : 
            deleteMutation.isPending ? "Deleting setlist..." : 
            "Converting setlist..."
        }
      />

      <div className="space-y-6 pb-20">
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sticky top-[56px] md:top-0 z-30 bg-background/95 backdrop-blur py-2">
            <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    Setlists
                    {!isOnline && <CloudOff className="h-5 w-5 text-muted-foreground" />}
                </h1>
                <p className="text-muted-foreground text-sm">
                    {isOnline ? "Manage song collections." : "Offline Mode: Read Only"}
                </p>
            </div>
            {/* Desktop Button */}
            <Button 
                onClick={() => setIsTypeSelectionOpen(true)} 
                className="hidden md:flex rounded-full shadow-lg"
                disabled={!isOnline}
            >
                <Plus className="mr-2 h-4 w-4" /> Create Setlist
            </Button>
         </div>

         <div className="flex items-center justify-between gap-4">
             <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full max-w-[400px]">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="public" className="gap-2"><Globe className="h-4 w-4" /> Band</TabsTrigger>
                    <TabsTrigger value="personal" className="gap-2"><Lock className="h-4 w-4" /> Personal</TabsTrigger>
                </TabsList>
            </Tabs>
            
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="shrink-0"><Filter className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Sort By</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                        <DropdownMenuRadioItem value="name">Name (A-Z)</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="created">Date Created (Newest)</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="updated">Date Updated (Newest)</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>
         </div>

        {isLoading ? <Loader2 className="h-8 w-8 animate-spin mx-auto" /> : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredSetlists.map(list => {
                    const canEdit = canEditSetlist(list);
                    return (
                        <Link key={list.id} to={`/setlists/${list.id}`}>
                            <Card className={`hover:bg-accent/40 hover:border-primary/50 transition-all cursor-pointer h-full border rounded-xl shadow-sm hover:shadow-md relative group ${list.is_default ? 'border-primary/50 bg-primary/5' : ''}`}>
                                <CardHeader className="flex flex-row items-start justify-between pb-2 pr-14">
                                    <div className="space-y-1">
                                        <CardTitle className="text-lg font-bold truncate">{list.name}</CardTitle>
                                        {list.is_default && <Badge variant="default" className="text-[10px] h-5">Default</Badge>}
                                        {!canEdit && <Badge variant="outline" className="text-[10px] h-5 ml-2">Read Only</Badge>}
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="text-sm text-muted-foreground pb-6">
                                        {list.sets.length} Sets • {list.sets.reduce((acc: number, s: any) => acc + s.songs.length, 0)} Songs
                                    </div>
                                </CardContent>
                                
                                {/* Top Right: Menu Actions */}
                                <div className="absolute top-2 right-2 flex items-center">
                                    {isOnline && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-muted" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                                                    <MoreVertical className="h-5 w-5 text-muted-foreground" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-56">
                                                <DropdownMenuItem className="py-3" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openCreateModal("clone", list.id); }}>
                                                    <Copy className="mr-2 h-4 w-4" /> Clone...
                                                </DropdownMenuItem>
                                                
                                                {list.is_personal && (
                                                    <>
                                                        <DropdownMenuItem className="py-3" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCloneAsBand(list); }}>
                                                            <Globe className="mr-2 h-4 w-4" /> Clone to Band
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem className="py-3" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConvertId(list.id); }}>
                                                            <RefreshCw className="mr-2 h-4 w-4" /> Convert to Band...
                                                        </DropdownMenuItem>
                                                    </>
                                                )}

                                                {canEdit && (
                                                    <>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem className="text-destructive py-3" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteRequest(list.id); }}>
                                                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>

                                {/* Bottom Right: Print Button */}
                                <div className="absolute bottom-2 right-2 z-10">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-10 w-10 hover:bg-muted text-muted-foreground hover:text-foreground" 
                                        onClick={(e) => { 
                                            e.preventDefault(); 
                                            e.stopPropagation(); 
                                            setPrintSetlist(list); 
                                        }}
                                        title="Print Setlist"
                                    >
                                        <Printer className="h-5 w-5" />
                                    </Button>
                                </div>
                            </Card>
                        </Link>
                    );
                })}
            </div>
        )}

        {/* Mobile FAB */}
        <Button
            onClick={() => setIsTypeSelectionOpen(true)}
            size="icon"
            className="md:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] right-4 z-40 rounded-full shadow-xl h-14 w-14 bg-primary hover:bg-primary/90 text-primary-foreground"
            disabled={!isOnline}
        >
            <Plus className="h-8 w-8" />
        </Button>

         {/* Type Selection Dialog */}
         <Dialog open={isTypeSelectionOpen} onOpenChange={setIsTypeSelectionOpen}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Create New Setlist</DialogTitle>
                    <DialogDescription>Choose the type of setlist you want to create.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
                    <Card 
                        className="cursor-pointer hover:border-primary hover:bg-primary/5 transition-all group"
                        onClick={() => { setIsTypeSelectionOpen(false); openCreateModal("public"); }}
                    >
                        <CardHeader className="text-center pb-2">
                            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                <Users className="w-6 h-6" />
                            </div>
                            <CardTitle className="text-base">Band Setlist</CardTitle>
                        </CardHeader>
                        <CardContent className="text-center text-sm text-muted-foreground px-4 pb-4">
                            Visible to all band members. Perfect for gigs and rehearsals.
                        </CardContent>
                    </Card>

                    <Card 
                        className="cursor-pointer hover:border-primary hover:bg-primary/5 transition-all group"
                        onClick={() => { setIsTypeSelectionOpen(false); openCreateModal("personal"); }}
                    >
                        <CardHeader className="text-center pb-2">
                            <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mx-auto mb-2 text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                <Lock className="w-6 h-6" />
                            </div>
                            <CardTitle className="text-base">Personal Setlist</CardTitle>
                        </CardHeader>
                        <CardContent className="text-center text-sm text-muted-foreground px-4 pb-4">
                            Visible only to you. Great for practice or ideas.
                        </CardContent>
                    </Card>
                </div>
            </DialogContent>
         </Dialog>

         {/* Create Modal */}
         <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {createMode === 'clone' 
                            ? (cloneType === 'public' ? 'Clone as Band Setlist' : 'Clone Setlist') 
                            : 'New Setlist'}
                    </DialogTitle>
                    <DialogDescription>Enter a name for your setlist.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Name</Label>
                        <Input 
                            value={newListName} 
                            onChange={e => setNewListName(e.target.value)} 
                            placeholder={createMode === 'public' ? "e.g. Summer Tour 2024" : "e.g. My Practice List"} 
                            autoFocus
                        />
                    </div>
                    {((createMode === 'public') || (createMode === 'clone' && cloneType === 'public')) && !hasDefault && (
                        <div className="flex items-center gap-2">
                            <Checkbox id="isDef" checked={isDefault} onCheckedChange={(c) => setIsDefault(c === true)} />
                            <Label htmlFor="isDef">Make Default Band Setlist</Label>
                        </div>
                    )}
                    <DialogFooter>
                        <Button onClick={() => createMutation.mutate()} disabled={!newListName.trim() || createMutation.isPending}>
                            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Create
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
         </Dialog>

         {/* Convert Dialog */}
         <AlertDialog open={!!convertId} onOpenChange={(val) => !val && setConvertId(null)}>
             <AlertDialogContent>
                 <AlertDialogHeader>
                     <AlertDialogTitle>Convert to Band Setlist?</AlertDialogTitle>
                     <AlertDialogDescription>
                         This action is <b>not reversible</b>. This setlist will become publicly viewable and editable by all band members.
                         <br/><br/>
                         If you want to keep your personal copy, choose "Clone to Band" instead.
                     </AlertDialogDescription>
                 </AlertDialogHeader>
                 <AlertDialogFooter>
                     <AlertDialogCancel disabled={convertMutation.isPending}>Cancel</AlertDialogCancel>
                     <AlertDialogAction onClick={() => convertId && convertMutation.mutate(convertId)} disabled={convertMutation.isPending}>Convert</AlertDialogAction>
                 </AlertDialogFooter>
             </AlertDialogContent>
         </AlertDialog>

         {/* Delete Alert */}
         <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" /> Delete Setlist?
                    </AlertDialogTitle>
                    <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
                    <div className="pt-2 text-sm text-muted-foreground space-y-4">
                        {isCheckingUsage ? (
                            <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking usage...</div>
                        ) : usageData.length > 0 ? (
                            <>
                                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-600">
                                    <p className="font-semibold mb-1">Warning: Used in {usageData.length} Gig{usageData.length !== 1 ? 's' : ''}</p>
                                    <p>Deleting this setlist will delete these gigs unless you replace the setlist first:</p>
                                </div>
                                <ScrollArea className="h-24 rounded border p-2">
                                    <ul className="list-disc list-inside space-y-1">
                                        {usageData.map((gig, idx) => (
                                            <li key={idx}>
                                                <span className="font-medium">{gig.name}</span> 
                                                <span className="text-xs text-muted-foreground ml-2">({new Date(gig.start_time).toLocaleDateString()})</span>
                                            </li>
                                        ))}
                                    </ul>
                                </ScrollArea>
                                <p>Please go to the Gigs page and assign a different setlist before deleting this one.</p>
                            </>
                        ) : (
                            <p>Are you sure you want to delete this setlist? This action cannot be undone.</p>
                        )}
                    </div>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                        onClick={() => deleteId && deleteMutation.mutate(deleteId)} 
                        className="bg-destructive"
                        disabled={usageData.length > 0 || deleteMutation.isPending} // Prevent delete if used
                    >
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {/* Print Dialog */}
        <SetlistPrintDialog 
            open={!!printSetlist} 
            setlist={printSetlist} 
            onClose={() => setPrintSetlist(null)} 
        />
      </div>
    </AppLayout>
  );
};

export default Setlists;