import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { deleteGig, cancelGig, saveGig } from "@/lib/api";
import { Plus, Calendar, Trash2, Loader2, MapPin, CloudOff, Clock, Play, Ban, RefreshCw, AlertTriangle } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Gig } from "@/types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription
} from "@/components/ui/alert-dialog";
import { Link, useNavigate } from "react-router-dom";
import { useSyncedGigs, useSyncedSetlists } from "@/hooks/useSyncedData";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { LoadingDialog } from "@/components/LoadingDialog";
import { format, parseISO } from "date-fns";
import { GigCreateWizard } from "@/components/GigCreateWizard";
import { useAuth } from "@/context/AuthContext";
import { useBand } from "@/context/BandContext";
import { PerformanceSessionDialog } from "@/components/PerformanceSessionDialog";

const Gigs = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const isOnline = useNetworkStatus();
    const { canManageGigs } = useAuth();
    const { activeBandId } = useBand();
    
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [showPast, setShowPast] = useState(false);
    
    // Performance Session State
    const [selectedGig, setSelectedGig] = useState<Gig | null>(null);

    // Cancel State
    const [gigToCancel, setGigToCancel] = useState<Gig | null>(null);
    const [cancelReason, setCancelReason] = useState("");
    const [customReason, setCustomReason] = useState("");

    // Reschedule State
    const [gigToReschedule, setGigToReschedule] = useState<Gig | null>(null);
    const [newStart, setNewStart] = useState("");
    const [newEnd, setNewEnd] = useState("");

    // Use Master Cache
    const { data: gigs = [], isLoading } = useSyncedGigs();
    const { data: setlists = [] } = useSyncedSetlists();

    // Filter band setlists for wizard (only public/band lists)
    const bandSetlists = useMemo(() => setlists.filter(s => !s.is_personal), [setlists]);

    const groupedGigs = useMemo(() => {
        const now = new Date().toISOString();
        const upcoming = gigs.filter(g => g.start_time >= now).sort((a, b) => a.start_time.localeCompare(b.start_time));
        const past = gigs.filter(g => g.start_time < now).sort((a, b) => b.start_time.localeCompare(a.start_time));
        return { upcoming, past };
    }, [gigs]);

    const cancelMutation = useMutation({
        mutationFn: async () => {
            if (!gigToCancel || !activeBandId) return;
            const reason = cancelReason === 'Other' ? customReason : cancelReason;
            await cancelGig(activeBandId, gigToCancel.id, reason);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['gigs'] });
            setGigToCancel(null);
            setCancelReason("");
            setCustomReason("");
            toast.success("Gig cancelled");
        },
        onError: (e: any) => toast.error("Failed to cancel: " + e.message)
    });

    const rescheduleMutation = useMutation({
        mutationFn: async () => {
            if (!gigToReschedule) return;
            const date = new Date(newStart);
            const offset = date.getTimezoneOffset() * 60000;
            const startISO = new Date(date.getTime() - offset).toISOString();
            
            let endISO = null;
            if (newEnd) {
                const eDate = new Date(newEnd);
                endISO = new Date(eDate.getTime() - offset).toISOString();
            }

            await saveGig(activeBandId!, { 
                ...gigToReschedule,
                start_time: startISO,
                end_time: endISO
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['gigs'] });
            setGigToReschedule(null);
            toast.success("Gig rescheduled");
        },
        onError: (e: any) => toast.error("Failed to reschedule: " + e.message)
    });

    const handleSessionJoin = (role: string, sessionId: string) => {
        if (!selectedGig) return;
        let url = `/performance/${selectedGig.setlist_id}?gigId=${selectedGig.id}`;
        if (role === 'standalone') {
            url += '&standalone=true';
        }
        navigate(url);
    };

    const openReschedule = (gig: Gig) => {
        setGigToReschedule(gig);
        // Pre-fill
        const toInput = (iso: string) => iso ? iso.slice(0, 16) : "";
        setNewStart(toInput(gig.start_time));
        setNewEnd(toInput(gig.end_time || ""));
    };

    return (
        <AppLayout>
             <LoadingDialog open={cancelMutation.isPending || rescheduleMutation.isPending} />

             <div className="space-y-6 pb-20">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sticky top-[56px] md:top-0 z-30 bg-background/95 backdrop-blur py-2">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                            Gigs
                            {!isOnline && <CloudOff className="h-5 w-5 text-muted-foreground" />}
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            {isOnline ? "Upcoming shows and events." : "Offline Mode: Read Only"}
                        </p>
                    </div>
                    {/* Desktop Button */}
                    {canManageGigs && (
                        <Button onClick={() => setIsCreateOpen(true)} className="hidden md:flex rounded-full shadow-lg" disabled={!isOnline}>
                            <Plus className="mr-2 h-4 w-4" /> Add Gig
                        </Button>
                    )}
                </div>

                {isLoading ? <Loader2 className="h-8 w-8 animate-spin mx-auto" /> : (
                    <>
                        <section className="space-y-4">
                            {groupedGigs.upcoming.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                                    <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                                    <h3 className="font-medium text-lg">No upcoming gigs</h3>
                                    {canManageGigs && <p className="text-muted-foreground">Add a gig to get started!</p>}
                                </div>
                            ) : (
                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                    {groupedGigs.upcoming.map(gig => (
                                        <div key={gig.id} className="relative group">
                                            <Card className={`relative overflow-hidden transition-all hover:shadow-md ${gig.cancelled_at ? 'opacity-70 bg-muted/30' : ''}`}>
                                                <CardContent className="p-5">
                                                    {/* Top Right Actions */}
                                                    <div className="absolute top-4 right-4 flex gap-2">
                                                        {gig.setlist && !gig.cancelled_at && (
                                                            <Button 
                                                                size="sm" 
                                                                className="h-8 gap-2 bg-green-600 hover:bg-green-700 text-white shadow-sm"
                                                                onClick={() => setSelectedGig(gig)}
                                                            >
                                                                <Play className="h-3 w-3 fill-current" /> Perform
                                                            </Button>
                                                        )}
                                                    </div>

                                                    <Link to={`/gigs/${gig.id}`} className="block pr-24">
                                                        {/* Cancelled Badge */}
                                                        {gig.cancelled_at && (
                                                            <div className="inline-flex items-center gap-1 bg-destructive/10 text-destructive px-2 py-0.5 rounded text-[10px] font-bold uppercase mb-2 border border-destructive/20">
                                                                <Ban className="h-3 w-3" /> Cancelled
                                                            </div>
                                                        )}

                                                        <div className="space-y-3">
                                                            <div>
                                                                <h3 className={`font-bold text-lg leading-tight ${gig.cancelled_at ? 'line-through decoration-destructive' : ''}`}>
                                                                    {gig.name}
                                                                </h3>
                                                                {gig.cancelled_at && gig.cancellation_reason && (
                                                                    <p className="text-xs text-destructive mt-1 italic">Reason: {gig.cancellation_reason}</p>
                                                                )}
                                                            </div>

                                                            <div className="space-y-1.5">
                                                                <div className="flex items-center text-sm text-muted-foreground">
                                                                    <Calendar className="mr-2 h-4 w-4 text-primary/70" />
                                                                    <span className="font-medium text-foreground">
                                                                        {format(parseISO(gig.start_time), "EEE, MMM d")}
                                                                    </span>
                                                                    <span className="mx-1.5 opacity-30">|</span>
                                                                    <Clock className="mr-1.5 h-3.5 w-3.5" />
                                                                    {format(parseISO(gig.start_time), "h:mm a")}
                                                                </div>
                                                                
                                                                <div className="flex items-center text-sm text-muted-foreground">
                                                                    <MapPin className="mr-2 h-4 w-4 text-primary/70" />
                                                                    <span className="truncate">{gig.venue_name || "TBD"}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </Link>

                                                    {/* Action Buttons Row */}
                                                    {canManageGigs && !gig.cancelled_at && (
                                                        <div className="flex gap-2 mt-5 pt-4 border-t">
                                                            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => openReschedule(gig)}>
                                                                <RefreshCw className="mr-1.5 h-3 w-3" /> Reschedule
                                                            </Button>
                                                            <Button variant="ghost" size="sm" className="flex-1 h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setGigToCancel(gig)}>
                                                                <Ban className="mr-1.5 h-3 w-3" /> Cancel
                                                            </Button>
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <div className="pt-8 border-t">
                            <div className="flex items-center gap-2 mb-4">
                                <Checkbox id="showPast" checked={showPast} onCheckedChange={(c) => setShowPast(c === true)} />
                                <Label htmlFor="showPast">Show Past Gigs</Label>
                            </div>
                            {showPast && (
                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 opacity-75">
                                    {groupedGigs.past.map(gig => (
                                        <Card key={gig.id}>
                                            <CardContent className="p-4">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="font-bold">{gig.name}</div>
                                                        <div className="text-sm text-muted-foreground">{format(parseISO(gig.start_time), "MMM d, yyyy")}</div>
                                                    </div>
                                                    {gig.cancelled_at && <Ban className="h-4 w-4 text-destructive" />}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Mobile FAB */}
                {canManageGigs && (
                    <Button
                        onClick={() => setIsCreateOpen(true)}
                        size="icon"
                        className="md:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] right-4 z-40 rounded-full shadow-xl h-14 w-14 bg-primary hover:bg-primary/90 text-primary-foreground"
                        disabled={!isOnline}
                    >
                        <Plus className="h-8 w-8" />
                    </Button>
                )}

                {/* New Wizard Component */}
                <GigCreateWizard 
                    open={isCreateOpen}
                    onClose={() => setIsCreateOpen(false)}
                    setlists={bandSetlists}
                />

                {/* Cancel Dialog */}
                <AlertDialog open={!!gigToCancel} onOpenChange={(open) => !open && setGigToCancel(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-destructive flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5" /> Cancel Gig?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to cancel <b>{gigToCancel?.name}</b>? This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        
                        <div className="py-2 space-y-3">
                            <Label>Reason (Optional)</Label>
                            <Select onValueChange={setCancelReason}>
                                <SelectTrigger><SelectValue placeholder="Select a reason..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Venue Cancelled">Venue Cancelled</SelectItem>
                                    <SelectItem value="Illness">Illness / Emergency</SelectItem>
                                    <SelectItem value="Weather">Weather</SelectItem>
                                    <SelectItem value="Scheduling Conflict">Scheduling Conflict</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                            {cancelReason === 'Other' && (
                                <Input placeholder="Enter reason..." value={customReason} onChange={e => setCustomReason(e.target.value)} />
                            )}
                        </div>

                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={cancelMutation.isPending}>Keep Gig</AlertDialogCancel>
                            <AlertDialogAction 
                                onClick={() => cancelMutation.mutate()} 
                                className="bg-destructive hover:bg-destructive/90"
                                disabled={cancelMutation.isPending}
                            >
                                Confirm Cancellation
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Reschedule Dialog */}
                <Dialog open={!!gigToReschedule} onOpenChange={(open) => !open && setGigToReschedule(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Reschedule Gig</DialogTitle>
                            <DialogDescription>Change the date and time for <b>{gigToReschedule?.name}</b>.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label>Start Time</Label>
                                <Input 
                                    type="datetime-local" 
                                    value={newStart} 
                                    onChange={e => setNewStart(e.target.value)} 
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>End Time</Label>
                                <Input 
                                    type="datetime-local" 
                                    value={newEnd} 
                                    onChange={e => setNewEnd(e.target.value)} 
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setGigToReschedule(null)}>Cancel</Button>
                            <Button onClick={() => rescheduleMutation.mutate()} disabled={rescheduleMutation.isPending || !newStart}>
                                {rescheduleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save New Time
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Performance Session Dialog */}
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

export default Gigs;