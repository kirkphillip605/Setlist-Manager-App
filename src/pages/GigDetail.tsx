import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveGig, deleteGig } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Loader2, MapPin, Calendar, Edit, ListMusic, ChevronLeft, Navigation, CloudOff, Clock, Trash2, AlertTriangle, Play } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useBand } from "@/context/BandContext";
import { Gig } from "@/types";
import { useSyncedGigs, useSyncedSetlists } from "@/hooks/useSyncedData";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { LoadingDialog } from "@/components/LoadingDialog";
import { format, parseISO, differenceInMinutes } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription
} from "@/components/ui/alert-dialog";
import { PerformanceSessionDialog } from "@/components/PerformanceSessionDialog";

const GigDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { activeBandId, isManager: canManageGigs } = useBand();
    const queryClient = useQueryClient();
    const isOnline = useNetworkStatus();
    
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [editForm, setEditForm] = useState<Partial<Gig>>({});
    
    // Performance Dialog
    const [isSessionOpen, setIsSessionOpen] = useState(false);

    const { data: gigs = [], isLoading } = useSyncedGigs();
    const gig = useMemo(() => gigs.find(g => g.id === id), [gigs, id]);

    const { data: setlists = [] } = useSyncedSetlists();
    const bandSetlists = useMemo(() => setlists.filter(s => !s.is_personal), [setlists]);

    const saveMutation = useMutation({
        mutationFn: (gig: Partial<Gig>) => saveGig(activeBandId!, gig),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['gigs'] });
            setIsEditOpen(false);
            toast.success("Gig updated");
        },
        onError: (e: any) => toast.error("Failed to update gig: " + (e.message || "Unknown error"))
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deleteGig(activeBandId!, id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['gigs'] });
            toast.success("Gig deleted");
            navigate("/gigs");
        },
        onError: (e: any) => {
            setShowDeleteConfirm(false);
            toast.error(e.message || "Failed to delete gig");
        }
    });

    const handleEditOpen = () => {
        if (!isOnline) {
            toast.error("Offline: Cannot edit gig");
            return;
        }
        if (!gig) return;
        
        const formatForInput = (isoString?: string | null) => {
            if (!isoString) return "";
            return isoString.slice(0, 16);
        };

        setEditForm({
            id: gig.id,
            name: gig.name,
            start_time: formatForInput(gig.start_time),
            end_time: formatForInput(gig.end_time),
            notes: gig.notes,
            setlist_id: gig.setlist_id,
            venue_name: gig.venue_name,
            address: gig.address,
            city: gig.city,
            state: gig.state,
            zip: gig.zip
        });
        setIsEditOpen(true);
    };

    const handleStartTimeChange = (val: string) => {
        if (val) {
            const startDate = new Date(val);
            const endDate = new Date(startDate.getTime() + 4 * 60 * 60 * 1000);
            const offset = date => date.getTime() - (date.getTimezoneOffset() * 60000);
            const endString = new Date(offset(endDate)).toISOString().slice(0, 16);
            
            setEditForm(prev => ({ 
                ...prev, 
                start_time: val,
                end_time: endString 
            }));
        } else {
            setEditForm(prev => ({ ...prev, start_time: val }));
        }
    };

    const handleNavigate = () => {
        if (!gig) return;
        const fullAddress = `${gig.address || ''}, ${gig.city || ''}, ${gig.state || ''} ${gig.zip || ''}`.trim().replace(/^,/, '').replace(/,$/, '');
        const query = gig.venue_name ? `${gig.venue_name}, ${fullAddress}` : fullAddress;
        
        if (!query) {
            toast.error("No address or venue name to navigate to.");
            return;
        }
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
    };

    const handleSessionJoin = (role: string, sessionId: string) => {
        if (!gig) return;
        let url = `/performance/${gig.setlist_id}?gigId=${gig.id}`;
        if (role === 'standalone') {
            url += '&standalone=true';
        }
        navigate(url);
    };

    if (isLoading && !gig) return (
        <AppLayout>
            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        </AppLayout>
    );

    if (!gig) return (
        <AppLayout>
            <div className="text-center p-8">Gig not found</div>
        </AppLayout>
    );

    const isPast = new Date(gig.end_time || gig.start_time) < new Date();
    const canEdit = canManageGigs && !isPast && isOnline;
    
    // Duration calc
    let durationStr = "";
    if (gig.end_time) {
        const start = parseISO(gig.start_time);
        const end = parseISO(gig.end_time);
        const mins = differenceInMinutes(end, start);
        const hrs = Math.floor(mins / 60);
        const remainingMins = mins % 60;
        durationStr = `${hrs}hr${remainingMins > 0 ? ` ${remainingMins}m` : ''}`;
    }

    return (
        <AppLayout>
            <LoadingDialog open={saveMutation.isPending || deleteMutation.isPending} />
            <div className="space-y-6 pb-20 max-w-3xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => navigate("/gigs")}>
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">{gig.name}</h1>
                            {!isOnline && <span className="flex items-center text-xs bg-muted px-1.5 rounded w-fit mt-1"><CloudOff className="w-3 h-3 mr-1" /> Offline</span>}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {gig.setlist && (
                            <Button 
                                variant="default" 
                                className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => setIsSessionOpen(true)}
                            >
                                <Play className="h-4 w-4 fill-current" /> <span className="hidden sm:inline">Perform</span>
                            </Button>
                        )}
                        {canEdit && (
                            <>
                                <Button variant="outline" size="icon" onClick={handleEditOpen}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="destructive" size="icon" onClick={() => setShowDeleteConfirm(true)}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {/* Info Grid */}
                <div className="grid gap-6 md:grid-cols-2">
                    
                    {/* Time Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Calendar className="h-4 w-4 text-primary" /> Date & Time
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-col gap-1">
                                <span className="text-sm text-muted-foreground uppercase font-semibold tracking-wider">Date</span>
                                <span className="text-lg font-medium">{format(parseISO(gig.start_time), "EEEE, MMMM d, yyyy")}</span>
                            </div>
                            
                            <div className="flex gap-8">
                                <div className="flex flex-col gap-1">
                                    <span className="text-sm text-muted-foreground uppercase font-semibold tracking-wider">Start</span>
                                    <div className="flex items-center gap-2">
                                        <Clock className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-lg font-medium">{format(parseISO(gig.start_time), "h:mm a")}</span>
                                    </div>
                                </div>
                                {gig.end_time && (
                                    <div className="flex flex-col gap-1">
                                        <span className="text-sm text-muted-foreground uppercase font-semibold tracking-wider">End</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-medium">{format(parseISO(gig.end_time), "h:mm a")}</span>
                                            {durationStr && <span className="text-xs bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">({durationStr})</span>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Venue Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <MapPin className="h-4 w-4 text-primary" /> Location
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <div className="font-semibold text-lg">{gig.venue_name || "Venue Name TBD"}</div>
                                <div className="text-muted-foreground mt-1">
                                    {gig.address && <div>{gig.address}</div>}
                                    {(gig.city || gig.state || gig.zip) && (
                                        <div>{gig.city}{gig.city && gig.state ? ', ' : ''}{gig.state} {gig.zip}</div>
                                    )}
                                    {!gig.address && !gig.city && <span className="italic opacity-70">No address provided</span>}
                                </div>
                            </div>
                            
                            {(gig.venue_name || gig.address) && (
                                <Button onClick={handleNavigate} variant="outline" size="sm" className="w-full">
                                    <Navigation className="mr-2 h-4 w-4" /> Get Directions
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Setlist Card */}
                <Card>
                     <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ListMusic className="h-4 w-4 text-primary" /> Setlist
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {gig.setlist ? (
                             <Button asChild variant="outline" className="w-full justify-start h-auto py-4 px-4 bg-muted/10 hover:bg-muted/20 border-dashed">
                                <Link to={`/setlists/${gig.setlist.id}`} className="flex flex-col items-start gap-1">
                                    <span className="font-bold text-lg">{gig.setlist.name}</span>
                                    <span className="text-sm text-muted-foreground font-normal">
                                        {gig.setlist.sets?.length || 0} Sets • View details
                                    </span>
                                </Link>
                             </Button>
                        ) : (
                            <div className="text-muted-foreground italic bg-muted/20 p-4 rounded-lg text-center border border-dashed">
                                No setlist assigned yet.
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Notes Card */}
                {gig.notes && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Notes</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="whitespace-pre-wrap text-sm leading-relaxed">{gig.notes}</div>
                        </CardContent>
                    </Card>
                )}

                {/* Edit Dialog */}
                <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                    <DialogContent className="max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Edit Gig Details</DialogTitle>
                            <DialogDescription>Update the information for this gig.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label>Event Name</Label>
                                <Input value={editForm.name || ""} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Start</Label>
                                    <Input 
                                        type="datetime-local" 
                                        value={editForm.start_time || ""} 
                                        onChange={e => handleStartTimeChange(e.target.value)} 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>End</Label>
                                    <Input 
                                        type="datetime-local" 
                                        value={editForm.end_time || ""} 
                                        onChange={e => setEditForm({ ...editForm, end_time: e.target.value })} 
                                    />
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label>Venue Name</Label>
                                <Input value={editForm.venue_name || ""} onChange={e => setEditForm({ ...editForm, venue_name: e.target.value })} />
                            </div>
                            <div className="grid gap-2">
                                <Label>Address</Label>
                                <Input value={editForm.address || ""} onChange={e => setEditForm({ ...editForm, address: e.target.value })} placeholder="123 Main St" />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-1">
                                    <Label>City</Label>
                                    <Input value={editForm.city || ""} onChange={e => setEditForm({ ...editForm, city: e.target.value })} />
                                </div>
                                <div>
                                    <Label>State</Label>
                                    <Input value={editForm.state || ""} onChange={e => setEditForm({ ...editForm, state: e.target.value })} />
                                </div>
                                <div>
                                    <Label>Zip</Label>
                                    <Input value={editForm.zip || ""} onChange={e => setEditForm({ ...editForm, zip: e.target.value })} />
                                </div>
                            </div>
                             <div className="grid gap-2">
                                <Label>Setlist</Label>
                                <Select 
                                    value={editForm.setlist_id || "none"} 
                                    onValueChange={val => setEditForm({ ...editForm, setlist_id: val === "none" ? null : val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a setlist..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">-- No Setlist --</SelectItem>
                                        {bandSetlists.map(s => (
                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>Notes</Label>
                                <Textarea value={editForm.notes || ""} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={() => saveMutation.mutate(editForm)} disabled={saveMutation.isPending}>Save Changes</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Delete Alert */}
                <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                                <AlertTriangle className="h-5 w-5" /> Delete Gig?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                Are you sure you want to delete <b>{gig.name}</b>? This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                                onClick={() => deleteMutation.mutate(gig.id)} 
                                className="bg-destructive hover:bg-destructive/90"
                            >
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <PerformanceSessionDialog 
                    open={isSessionOpen}
                    gigId={gig.id}
                    gigName={gig.name}
                    onClose={() => setIsSessionOpen(false)}
                    onJoin={handleSessionJoin}
                />
            </div>
        </AppLayout>
    );
};

export default GigDetail;