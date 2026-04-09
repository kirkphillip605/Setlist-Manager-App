import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { getAllGigSessions, endGigSession, endAllSessions, cleanupStaleSessions } from "@/lib/api";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Radio, Trash2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { GigSession } from "@/types";
import { useBand } from "@/context/BandContext";

const AdminSessions = () => {
    const { activeBandId } = useBand();
    const [sessions, setSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [confirmEndAll, setConfirmEndAll] = useState(false);

    const fetchSessions = async () => {
        if (!activeBandId) return;
        setLoading(true);
        try {
            const data = await getAllGigSessions(activeBandId);
            setSessions(data || []);
        } catch (e) {
            console.error(e);
            toast.error("Failed to load sessions");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, [activeBandId]);

    const handleEndSession = async (id: string) => {
        if (!activeBandId) return;
        try {
            await endGigSession(activeBandId, id);
            toast.success("Session ended");
            fetchSessions();
        } catch (e) {
            toast.error("Failed to end session");
        }
    };

    const handleEndAll = async () => {
        if (!activeBandId) return;
        try {
            await endAllSessions(activeBandId);
            toast.success("All sessions ended");
            fetchSessions();
            setConfirmEndAll(false);
        } catch (e) {
            toast.error("Failed to end sessions");
        }
    };

    const handleCleanup = async () => {
        if (!activeBandId) return;
        try {
            await cleanupStaleSessions(activeBandId);
            toast.success("Cleanup complete");
            fetchSessions();
        } catch (e) {
            toast.error("Cleanup failed");
        }
    };

    return (
        <AppLayout>
            <div className="space-y-6 pb-20">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Active Sessions</h1>
                        <p className="text-muted-foreground">Monitor live performance sessions.</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleCleanup} title="Remove sessions stale > 15m">
                            <RefreshCw className="mr-2 h-4 w-4" /> Cleanup Stale
                        </Button>
                        <Button variant="destructive" onClick={() => setConfirmEndAll(true)}>
                            <Trash2 className="mr-2 h-4 w-4" /> End All
                        </Button>
                    </div>
                </div>

                <Card>
                    <CardContent className="p-0">
                        {loading ? <div className="p-8 flex justify-center"><Loader2 className="animate-spin" /></div> : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Gig</TableHead>
                                        <TableHead>Leader</TableHead>
                                        <TableHead>Started</TableHead>
                                        <TableHead>Last Heartbeat</TableHead>
                                        <TableHead>Participants</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sessions.length === 0 ? (
                                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No active sessions.</TableCell></TableRow>
                                    ) : (
                                        sessions.map(s => (
                                            <TableRow key={s.id}>
                                                <TableCell className="font-medium">{s.gig?.name || "Unknown Gig"}</TableCell>
                                                <TableCell>{s.leader?.first_name} {s.leader?.last_name}</TableCell>
                                                <TableCell>{new Date(s.started_at).toLocaleTimeString()}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full ${new Date().getTime() - new Date(s.last_heartbeat).getTime() < 30000 ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                                                        {formatDistanceToNow(new Date(s.last_heartbeat), { addSuffix: true })}
                                                    </div>
                                                </TableCell>
                                                <TableCell>{s.participants?.length || 0}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button size="sm" variant="destructive" onClick={() => handleEndSession(s.id)}>End</Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                <AlertDialog open={confirmEndAll} onOpenChange={setConfirmEndAll}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>End All Sessions?</AlertDialogTitle>
                            <AlertDialogDescription>This will immediately disconnect all users from their performance screens.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleEndAll} className="bg-destructive">End All</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </AppLayout>
    );
};

export default AdminSessions;