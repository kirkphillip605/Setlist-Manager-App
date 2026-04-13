import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, MapPin, Check, ChevronRight, ChevronLeft, Keyboard, Globe, Edit, Calendar, Clock, ListMusic } from "lucide-react";
import { Gig, Setlist } from "@/types";
import { searchVenues, saveGig } from "@/lib/api";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBand } from "@/context/BandContext";
import { useSyncAfterMutation } from "@/hooks/useSyncedData";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

interface GigCreateWizardProps {
    open: boolean;
    onClose: () => void;
    setlists: Setlist[];
}

export const GigCreateWizard = ({ open, onClose, setlists }: GigCreateWizardProps) => {
    const { activeBandId } = useBand();
    const syncAfterMutation = useSyncAfterMutation();
    const [step, setStep] = useState(1);
    // Step 2 Modes: 'search' (default) or 'form' (manual entry/edit)
    const [venueMode, setVenueMode] = useState<'search' | 'form'>('search');
    
    const [formData, setFormData] = useState<Partial<Gig>>({
        name: "",
        start_time: "",
        end_time: "",
        notes: "",
        venue_name: "",
        address: "",
        city: "",
        state: "",
        zip: "",
        setlist_id: null
    });

    const queryClient = useQueryClient();

    // Reset on open
    useEffect(() => {
        if (open) {
            setStep(1);
            setVenueMode('search');
            setSearchQuery("");
            setSearchResults([]);
            setHasSearched(false);
            
            // Default Start Time to next hour
            const now = new Date();
            now.setHours(now.getHours() + 1);
            now.setMinutes(0, 0, 0);
            const offset = now.getTimezoneOffset() * 60000;
            const startString = new Date(now.getTime() - offset).toISOString().slice(0, 16);

            setFormData({
                name: "",
                start_time: startString,
                end_time: "",
                notes: "",
                venue_name: "",
                address: "",
                city: "",
                state: "",
                zip: "",
                setlist_id: setlists.find(s => s.is_default)?.id || null
            });
        }
    }, [open, setlists]);

    // --- STEP 1 LOGIC ---
    const handleStartTimeChange = (val: string) => {
        if (val) {
            const date = new Date(val);
            date.setHours(date.getHours() + 4);
            const offset = date.getTimezoneOffset() * 60000;
            const endString = new Date(date.getTime() - offset).toISOString().slice(0, 16);
            
            setFormData(prev => ({ ...prev, start_time: val, end_time: endString }));
        } else {
            setFormData(prev => ({ ...prev, start_time: val }));
        }
    };

    // --- STEP 2 LOGIC (Venue) ---
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [hasSearched, setHasSearched] = useState(false);

    // Allow single word search, but encourage details
    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        
        setIsSearching(true);
        setHasSearched(true);
        
        try {
            const results = await searchVenues(searchQuery);
            setSearchResults(results);
            if (results.length === 0) toast.info("No venues found");
        } catch (e) {
            toast.error("Venue search failed");
        } finally {
            setIsSearching(false);
        }
    };

    const selectVenue = (item: any) => {
        setFormData(prev => ({
            ...prev,
            venue_name: item.title,
            address: `${item.address.houseNumber || ''} ${item.address.street || ''}`.trim(),
            city: item.address.city,
            state: item.address.stateCode,
            zip: item.address.postalCode
        }));
        setVenueMode('form'); // Switch to form to review/edit
        toast.success("Venue details applied. Review below.");
    };

    const jumpToStep = (stepNum: number) => {
        setStep(stepNum);
        // If editing venue, show form if data exists, otherwise search
        if (stepNum === 2) {
            setVenueMode(formData.venue_name ? 'form' : 'search');
        }
    };

    // --- FINAL SUBMISSION ---
    const saveMutation = useMutation({
        mutationFn: (gig: Partial<Gig>) => saveGig(activeBandId!, gig),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['gigs'] });
            syncAfterMutation();
            onClose();
            toast.success("Gig created successfully");
        },
        onError: (e: any) => toast.error("Failed to create gig: " + e.message)
    });

    // Navigation Handlers
    const handleNext = () => {
        if (step === 1 && !formData.name) return;
        setStep(step + 1);
    };

    const handleBack = () => {
        if (step === 2 && venueMode === 'form') {
            setVenueMode('search');
            return;
        }
        setStep(step - 1);
    };

    // Display Helpers
    const formatDateTime = (iso: string | undefined) => {
        if (!iso) return "TBD";
        return format(parseISO(iso), "MMM d, yyyy • h:mm a");
    };

    const getSetlistName = () => {
        if (!formData.setlist_id) return "None";
        return setlists.find(s => s.id === formData.setlist_id)?.name || "Unknown";
    };

    return (
        <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
            <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b shrink-0">
                    <DialogTitle>Create New Gig</DialogTitle>
                    <DialogDescription>
                        Step {step} of 4: {
                            step === 1 ? "Basic Details" : 
                            step === 2 ? "Venue Location" : 
                            step === 3 ? "Setlist" : 
                            "Review"
                        }
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden relative bg-muted/10">
                    
                    {/* STEP 1: BASICS */}
                    {step === 1 && (
                        <ScrollArea className="h-full">
                            <div className="p-6 space-y-6">
                                <div className="space-y-2">
                                    <Label>Gig Name <span className="text-destructive">*</span></Label>
                                    <Input 
                                        value={formData.name} 
                                        onChange={e => setFormData({ ...formData, name: e.target.value })} 
                                        placeholder="e.g. Summer Festival Main Stage"
                                        autoFocus
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Start Time <span className="text-destructive">*</span></Label>
                                        <Input 
                                            type="datetime-local" 
                                            value={formData.start_time} 
                                            onChange={e => handleStartTimeChange(e.target.value)} 
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>End Time (Optional)</Label>
                                        <Input 
                                            type="datetime-local" 
                                            value={formData.end_time} 
                                            onChange={e => setFormData({ ...formData, end_time: e.target.value })} 
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Notes</Label>
                                    <Textarea 
                                        value={formData.notes} 
                                        onChange={e => setFormData({ ...formData, notes: e.target.value })} 
                                        placeholder="Load in details, contact info, parking..." 
                                        className="h-32"
                                    />
                                </div>
                            </div>
                        </ScrollArea>
                    )}

                    {/* STEP 2: VENUE - SEARCH */}
                    {step === 2 && venueMode === 'search' && (
                        <div className="flex flex-col h-full">
                            <div className="p-4 bg-background border-b space-y-4 shrink-0">
                                <div className="flex gap-2">
                                    <Input 
                                        placeholder="Enter venue name & location (e.g. Docs Bar Watertown SD)" 
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                        autoFocus
                                    />
                                    <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
                                        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                    </Button>
                                </div>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="w-full"
                                    onClick={() => setVenueMode('form')}
                                >
                                    <Keyboard className="mr-2 h-4 w-4" /> Enter Manually
                                </Button>
                            </div>
                            
                            <div className="flex-1 overflow-hidden bg-background">
                                <ScrollArea className="h-full">
                                    {searchResults.length === 0 ? (
                                        <div className="p-8 text-center text-muted-foreground text-sm space-y-4">
                                            {hasSearched ? (
                                                <p>No venues found. Try adding City & State.</p>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/50">
                                                    <Globe className="w-12 h-12 mb-2" />
                                                    <p>For best results, include the venue name and location in your search query. For example, search "Docs Bar Watertown SD" instead of "Docs Bar"</p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="divide-y">
                                            {searchResults.map((item: any) => (
                                                <div 
                                                    key={item.id} 
                                                    className="p-4 hover:bg-accent cursor-pointer transition-colors flex items-center justify-between group"
                                                    onClick={() => selectVenue(item)}
                                                >
                                                    <div>
                                                        <div className="font-medium">{item.title}</div>
                                                        <div className="text-xs text-muted-foreground">{item.address.label}</div>
                                                    </div>
                                                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-50 group-hover:opacity-100" />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: VENUE - FORM (MANUAL/EDIT) */}
                    {step === 2 && venueMode === 'form' && (
                        <ScrollArea className="h-full bg-background">
                            <div className="p-6 space-y-4">
                                <div className="text-sm font-medium border-b pb-2 mb-2">Venue Details</div>
                                <div className="space-y-2">
                                    <Label>Venue Name</Label>
                                    <Input value={formData.venue_name} onChange={e => setFormData({...formData, venue_name: e.target.value})} autoFocus />
                                </div>
                                <div className="space-y-2">
                                    <Label>Address</Label>
                                    <Input value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-2">
                                        <Label>City</Label>
                                        <Input value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>State</Label>
                                        <Input value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Zip</Label>
                                    <Input value={formData.zip} onChange={e => setFormData({...formData, zip: e.target.value})} />
                                </div>
                            </div>
                        </ScrollArea>
                    )}

                    {/* STEP 3: SETLIST */}
                    {step === 3 && (
                        <div className="p-6 h-full flex flex-col items-center justify-center space-y-6">
                            <div className="w-full max-w-sm space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-base">Select Setlist</Label>
                                    <Select 
                                        value={formData.setlist_id || "none"} 
                                        onValueChange={val => setFormData({ ...formData, setlist_id: val === "none" ? null : val })}
                                    >
                                        <SelectTrigger className="h-12">
                                            <SelectValue placeholder="Choose a setlist..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">-- No Setlist --</SelectItem>
                                            {setlists.map(s => (
                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-sm text-muted-foreground">
                                        A setlist is required for performance mode features. You can change this later.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: REVIEW */}
                    {step === 4 && (
                        <ScrollArea className="h-full">
                            <div className="p-6 space-y-4">
                                <h3 className="text-lg font-semibold mb-4">Gig Detail Review</h3>
                                
                                <Card>
                                    <CardContent className="p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2 font-medium text-primary">
                                                <Calendar className="w-4 h-4" /> Basic Info
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => jumpToStep(1)}>
                                                <Edit className="w-3 h-3" />
                                            </Button>
                                        </div>
                                        <div className="space-y-1 text-sm">
                                            <div><span className="font-semibold">Name:</span> {formData.name}</div>
                                            <div><span className="font-semibold">Start:</span> {formatDateTime(formData.start_time)}</div>
                                            {formData.end_time && <div><span className="font-semibold">End:</span> {formatDateTime(formData.end_time)}</div>}
                                            {formData.notes && (
                                                <div className="mt-2 pt-2 border-t text-muted-foreground text-xs whitespace-pre-wrap">{formData.notes}</div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardContent className="p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2 font-medium text-primary">
                                                <MapPin className="w-4 h-4" /> Location
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => jumpToStep(2)}>
                                                <Edit className="w-3 h-3" />
                                            </Button>
                                        </div>
                                        <div className="space-y-1 text-sm">
                                            <div className="font-semibold text-lg">{formData.venue_name || "TBD"}</div>
                                            <div className="text-muted-foreground">
                                                {formData.address && <div>{formData.address}</div>}
                                                {(formData.city || formData.state || formData.zip) && (
                                                    <div>{formData.city}{formData.city && formData.state ? ', ' : ''}{formData.state} {formData.zip}</div>
                                                )}
                                                {!formData.venue_name && !formData.address && <span className="italic">No location set</span>}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardContent className="p-4">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2 font-medium text-primary">
                                                <ListMusic className="w-4 h-4" /> Setlist
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => jumpToStep(3)}>
                                                <Edit className="w-3 h-3" />
                                            </Button>
                                        </div>
                                        <div className="text-sm">
                                            {formData.setlist_id ? (
                                                <div className="font-semibold">{getSetlistName()}</div>
                                            ) : (
                                                <span className="italic text-muted-foreground">None selected</span>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </ScrollArea>
                    )}
                </div>

                <DialogFooter className="p-4 border-t bg-background flex flex-row justify-between sm:justify-between items-center shrink-0">
                    <Button variant="ghost" onClick={step === 1 ? onClose : handleBack}>
                        {step === 1 ? "Cancel" : <><ChevronLeft className="mr-2 h-4 w-4" /> Back</>}
                    </Button>
                    
                    <div className="flex gap-2">
                        {step < 4 ? (
                            // "Next" logic for Search mode: Disabled until manual or select used.
                            <Button 
                                onClick={handleNext} 
                                disabled={
                                    (step === 1 && !formData.name) || 
                                    (step === 2 && venueMode === 'search') // Force user to use buttons in search UI
                                }
                            >
                                Next <ChevronRight className="ml-2 h-4 w-4" />
                            </Button>
                        ) : (
                            <Button 
                                onClick={() => saveMutation.mutate(formData as Gig)} 
                                disabled={saveMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                            >
                                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Gig
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};