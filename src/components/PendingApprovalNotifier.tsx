import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { useBand } from '@/context/BandContext';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { UserPlus, X, Check, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface PendingMember {
  id: string;
  userId: string;
  email: string;
  first_name: string;
  last_name: string;
}

export const PendingApprovalNotifier = () => {
  const { activeBandId, activeBandRole } = useBand();
  const isManager = activeBandRole === 'owner' || activeBandRole === 'manager';

  const [pendingList, setPendingList]   = useState<PendingMember[]>([]);
  const [showDialog, setShowDialog]     = useState(false);
  const [isDisabled, setIsDisabled]     = useState(false);

  const fetchPending = async () => {
    if (!activeBandId || !isManager) return;
    try {
      const data = await apiFetch<PendingMember[]>('GET', `/api/bands/${activeBandId}/members/pending`);
      setPendingList(data ?? []);
    } catch {
      // Silent fail
    }
  };

  useEffect(() => {
    if (!isManager) return;
    fetchPending();
    const interval = setInterval(fetchPending, 30_000);
    return () => clearInterval(interval);
  }, [activeBandId, isManager]);

  const handleAction = async (action: 'approve' | 'deny', membershipId: string) => {
    try {
      await apiFetch('POST', `/api/bands/${activeBandId}/members/${membershipId}/${action}`);
      toast.success(action === 'approve' ? 'Member approved' : 'Request denied');
      setPendingList(prev => prev.filter(m => m.id !== membershipId));
    } catch (e: any) {
      toast.error('Action failed: ' + (e?.message ?? 'Unknown error'));
    }
  };

  const pendingCount = pendingList.length;
  if (!isManager || pendingCount === 0 || isDisabled) return null;

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-20 right-4 z-50 md:bottom-8"
        >
          <div
            className="bg-primary text-primary-foreground p-4 rounded-lg shadow-lg flex items-center gap-4 cursor-pointer hover:bg-primary/90 transition-colors"
            onClick={() => setShowDialog(true)}
          >
            <div className="relative">
              <UserPlus className="h-6 w-6" />
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold h-5 w-5 flex items-center justify-center rounded-full border-2 border-primary">
                {pendingCount}
              </span>
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm">Join Requests</p>
              <p className="text-xs opacity-90">{pendingCount} member{pendingCount !== 1 ? 's' : ''} waiting</p>
            </div>
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 hover:bg-primary-foreground/20 text-primary-foreground -mr-2"
              onClick={e => { e.stopPropagation(); setIsDisabled(true); }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pending Join Requests</DialogTitle>
            <DialogDescription>Review membership requests for your band.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {pendingList.map(m => (
              <div key={m.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                <div className="min-w-0 flex-1 mr-2">
                  <p className="font-medium truncate">{m.first_name} {m.last_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="icon" variant="outline" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleAction('deny', m.id)}>
                    <Ban className="h-4 w-4" />
                  </Button>
                  <Button size="icon" className="h-8 w-8 bg-green-600 hover:bg-green-700" onClick={() => handleAction('approve', m.id)}>
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
