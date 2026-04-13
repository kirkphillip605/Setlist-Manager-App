import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useBand } from '@/context/BandContext';
import {
  getBandMembers, getPendingMembers, type PendingMember,
  approveMember, denyMember,
  updateMemberRole, removeMember,
  regenerateJoinCode, updateBand,
  getBannedUsers, banUser, unbanUser,
  transferOwnership, requestDeleteOtp, deleteBand,
  getBandInvitations,
} from '@/lib/api';
import type { BandMembership, BandBan, BandRole, BandInvitation } from '@/types';
import AppLayout from '@/components/AppLayout';
import InviteMembersDialog from '@/components/InviteMembersDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Copy, RefreshCw, Check, Users, Shield, UserX, Loader2,
  ChevronLeft, UserCheck, UserMinus, Crown, Trash2, Ban, Mail,
  Calendar, Phone, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

const ROLE_COLORS: Record<BandRole, string> = {
  owner:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  member:  'bg-muted text-muted-foreground',
};

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
  } catch {
    document.body.removeChild(textarea);
    return Promise.reject(new Error('Copy failed'));
  }
  document.body.removeChild(textarea);
  return Promise.resolve();
}

const BandManage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeBand, activeBandId, isOwner, isManager, refreshBands } = useBand();

  const [members, setMembers]       = useState<BandMembership[]>([]);
  const [pending, setPending]       = useState<PendingMember[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BandBan[]>([]);
  const [loading, setLoading]       = useState(true);
  const [copied, setCopied]         = useState(false);
  const [joinCode, setJoinCode]     = useState(activeBand?.joinCode ?? '');
  const [regenLoading, setRegen]    = useState(false);

  const [editName, setEditName]       = useState(activeBand?.name ?? '');
  const [editDesc, setEditDesc]       = useState(activeBand?.description ?? '');
  const [savingInfo, setSavingInfo]   = useState(false);

  const [confirmRemove, setConfirmRemove] = useState<BandMembership | null>(null);
  const [banOnRemove, setBanOnRemove]     = useState(false);

  const [membersTab, setMembersTab] = useState<'members' | 'banned'>('members');

  const [showTransfer, setShowTransfer]           = useState(false);
  const [transferTarget, setTransferTarget]       = useState<BandMembership | null>(null);
  const [leaveAfterTransfer, setLeaveAfterTransfer] = useState(false);
  const [confirmTransfer, setConfirmTransfer]     = useState(false);
  const [transferring, setTransferring]           = useState(false);

  const [showDelete, setShowDelete]     = useState(false);
  const [deleteStep, setDeleteStep]     = useState<'confirm' | 'otp'>('confirm');
  const [deleteOtp, setDeleteOtp]       = useState('');
  const [deletingOtp, setDeletingOtp]   = useState(false);
  const [sendingOtp, setSendingOtp]     = useState(false);
  const [ownerEmail, setOwnerEmail]     = useState('');

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [sentInvitations, setSentInvitations] = useState<BandInvitation[]>([]);

  const loadInvitations = useCallback(async () => {
    if (!activeBandId || !isManager) return;
    try {
      const inv = await getBandInvitations(activeBandId);
      setSentInvitations(inv ?? []);
    } catch {
      // silent
    }
  }, [activeBandId, isManager]);

  const load = useCallback(async () => {
    if (!activeBandId) return;
    setLoading(true);
    try {
      const [m, p, b] = await Promise.all([
        getBandMembers(activeBandId),
        isManager ? getPendingMembers(activeBandId) : Promise.resolve([]),
        isManager ? getBannedUsers(activeBandId) : Promise.resolve([]),
      ]);
      setMembers(m ?? []);
      setPending(p ?? []);
      setBannedUsers(b ?? []);
    } catch {
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [activeBandId, isManager]);

  useEffect(() => {
    setEditName(activeBand?.name ?? '');
    setEditDesc(activeBand?.description ?? '');
    setJoinCode(activeBand?.joinCode ?? '');
  }, [activeBand]);

  useEffect(() => { void load(); void loadInvitations(); }, [load, loadInvitations]);

  const copyCode = () => {
    if (!joinCode) return;
    copyToClipboard(joinCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast.error('Failed to copy');
    });
  };

  const handleRegen = async () => {
    if (!activeBandId) return;
    setRegen(true);
    try {
      const res = await regenerateJoinCode(activeBandId);
      setJoinCode(res.joinCode);
      toast.success('Join code regenerated');
      refreshBands();
    } catch {
      toast.error('Failed to regenerate code');
    } finally {
      setRegen(false);
    }
  };

  const handleSaveInfo = async () => {
    if (!activeBandId || !editName.trim()) return;
    setSavingInfo(true);
    try {
      await updateBand(activeBandId, { name: editName.trim(), description: editDesc.trim() || undefined });
      await refreshBands();
      toast.success('Band info saved');
    } catch {
      toast.error('Failed to save band info');
    } finally {
      setSavingInfo(false);
    }
  };

  const handleApprove = async (m: PendingMember) => {
    if (!activeBandId) return;
    try {
      await approveMember(activeBandId, m.id);
      toast.success(`${m.firstName ?? 'Member'} approved`);
      void load();
    } catch {
      toast.error('Failed to approve member');
    }
  };

  const handleDeny = async (m: PendingMember) => {
    if (!activeBandId) return;
    try {
      await denyMember(activeBandId, m.id);
      toast.success('Request denied');
      void load();
    } catch {
      toast.error('Failed to deny request');
    }
  };

  const handleRoleChange = async (m: BandMembership, role: BandRole) => {
    if (!activeBandId) return;
    try {
      await updateMemberRole(activeBandId, m.userId, role, m.position ?? undefined);
      toast.success('Role updated');
      void load();
    } catch {
      toast.error('Failed to update role');
    }
  };

  const handleRemove = async () => {
    if (!activeBandId || !confirmRemove) return;
    try {
      await removeMember(activeBandId, confirmRemove.userId);
      if (banOnRemove) {
        await banUser(activeBandId, confirmRemove.userId);
      }
      toast.success(banOnRemove ? 'Member removed and banned' : 'Member removed');
      setConfirmRemove(null);
      setBanOnRemove(false);
      void load();
    } catch {
      toast.error('Failed to remove member');
    }
  };

  const handleUnban = async (userId: string) => {
    if (!activeBandId) return;
    try {
      await unbanUser(activeBandId, userId);
      toast.success('User unbanned');
      void load();
    } catch {
      toast.error('Failed to unban user');
    }
  };

  const handleTransferOwnership = async () => {
    if (!activeBandId || !transferTarget) return;
    setTransferring(true);
    try {
      await transferOwnership(activeBandId, transferTarget.userId, leaveAfterTransfer);
      toast.success('Ownership transferred');
      setConfirmTransfer(false);
      setShowTransfer(false);
      setTransferTarget(null);
      await refreshBands();
      if (leaveAfterTransfer) {
        navigate('/');
      } else {
        void load();
      }
    } catch {
      toast.error('Failed to transfer ownership');
    } finally {
      setTransferring(false);
    }
  };

  const handleRequestDeleteOtp = async () => {
    if (!activeBandId) return;
    setSendingOtp(true);
    try {
      const res = await requestDeleteOtp(activeBandId);
      setOwnerEmail(res.email);
      setDeleteStep('otp');
      toast.success('Verification code sent to your email');
    } catch {
      toast.error('Failed to send verification code');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleDeleteBand = async () => {
    if (!activeBandId || !deleteOtp.trim()) return;
    setDeletingOtp(true);
    try {
      await deleteBand(activeBandId, deleteOtp.trim());
      toast.success('Band deleted');
      setShowDelete(false);
      await refreshBands();
      navigate('/');
    } catch {
      toast.error('Invalid verification code or deletion failed');
    } finally {
      setDeletingOtp(false);
    }
  };

  const memberName = (m: BandMembership) =>
    m.user ? `${m.user.firstName ?? ''} ${m.user.lastName ?? ''}`.trim() : m.userId;

  const memberInitials = (m: BandMembership) => {
    const first = m.user?.firstName?.[0] ?? '';
    const last = m.user?.lastName?.[0] ?? '';
    return (first + last).toUpperCase() || '?';
  };

  if (!activeBand) {
    return (
      <AppLayout>
        <div className="p-4 text-center text-muted-foreground">No active band selected.</div>
      </AppLayout>
    );
  }

  const nonOwnerMembers = members.filter(m => m.userId !== user?.id && m.role !== 'owner');

  return (
    <AppLayout>
      <div className="container max-w-2xl mx-auto p-4 space-y-6 pb-20">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="-ml-2">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Band Management</h1>
        </div>

        {/* Band Info - Read-only for members, editable for managers/owners */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Shield className="h-4 w-4" /> Band Info
          </h2>
          <div className="space-y-3 bg-card border rounded-xl p-4">
            {isManager ? (
              <>
                <div className="space-y-1">
                  <Label htmlFor="edit-name">Band Name</Label>
                  <Input
                    id="edit-name"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-desc">Description</Label>
                  <Input
                    id="edit-desc"
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <Button onClick={handleSaveInfo} disabled={savingInfo} size="sm">
                  {savingInfo ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Save
                </Button>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-muted-foreground text-xs">Band Name</Label>
                  <p className="font-medium">{activeBand.name}</p>
                </div>
                {activeBand.description && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Description</Label>
                    <p className="text-sm">{activeBand.description}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Join Code - managers/owners only */}
        {isManager && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Join Code
            </h2>
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Share this code with musicians to invite them to your band.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 font-mono text-2xl tracking-[0.4em] text-center bg-muted rounded-lg py-3 px-4 font-bold select-all">
                  {joinCode || '------'}
                </div>
                <Button variant="outline" size="icon" onClick={copyCode} title="Copy code">
                  {copied
                    ? <Check className="h-4 w-4 text-green-600" />
                    : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleRegen} disabled={regenLoading}>
                  {regenLoading
                    ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    : <RefreshCw className="h-4 w-4 mr-2" />}
                  Regenerate Code
                </Button>
                <Button size="sm" onClick={() => setInviteDialogOpen(true)}>
                  <Send className="h-4 w-4 mr-2" />
                  Invite Member(s)
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Pending Requests - managers/owners only */}
        {isManager && pending.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <UserCheck className="h-4 w-4" /> Pending Requests ({pending.length})
            </h2>
            <div className="bg-card border rounded-xl divide-y overflow-hidden">
              {pending.map(m => {
                const name = `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || m.userId;
                return (
                  <div key={m.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{name}</p>
                      {m.email && <p className="text-xs text-muted-foreground truncate">{m.email}</p>}
                    </div>
                    <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950" onClick={() => handleApprove(m)}>
                      <UserCheck className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDeny(m)}>
                      <UserX className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Members / Banned Tabs */}
        <section className="space-y-3">
          {isManager ? (
            <Tabs value={membersTab} onValueChange={v => setMembersTab(v as 'members' | 'banned')}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="members" className="gap-1.5">
                  <Users className="h-4 w-4" /> Members ({members.length})
                </TabsTrigger>
                <TabsTrigger value="banned" className="gap-1.5">
                  <Ban className="h-4 w-4" /> Banned ({bannedUsers.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="members" className="mt-3">
                {renderMembersList()}
              </TabsContent>

              <TabsContent value="banned" className="mt-3">
                {renderBannedList()}
              </TabsContent>
            </Tabs>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Users className="h-4 w-4" /> Members ({members.length})
              </h2>
              {renderMembersList()}
            </>
          )}
        </section>

        {/* Invitations Sent */}
        {isManager && sentInvitations.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Send className="h-4 w-4" /> Invitations Sent ({sentInvitations.length})
            </h2>
            <div className="bg-card border rounded-xl divide-y overflow-hidden">
              {sentInvitations.map(inv => (
                <div key={inv.id} className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {inv.invited_email ? (
                        <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <p className="text-sm truncate">
                        {inv.invited_email ?? inv.invited_phone}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground ml-5">
                      Invited by {inv.inviter_name} &middot; {new Date(inv.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge
                    variant={inv.status === 'accepted' ? 'default' : inv.status === 'declined' ? 'destructive' : 'secondary'}
                    className="text-xs shrink-0"
                  >
                    {inv.status}
                  </Badge>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Owner Actions */}
        {isOwner && (
          <>
            <Separator />
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Crown className="h-4 w-4" /> Owner Actions
              </h2>
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start gap-3" onClick={() => { setShowTransfer(true); setTransferTarget(null); setLeaveAfterTransfer(false); }}>
                  <Crown className="h-4 w-4" />
                  Transfer Ownership
                </Button>
                <Button variant="outline" className="w-full justify-start gap-3 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { setShowDelete(true); setDeleteStep('confirm'); setDeleteOtp(''); }}>
                  <Trash2 className="h-4 w-4" />
                  Delete Band
                </Button>
              </div>
            </section>
          </>
        
        )}

        <Separator />

        <p className="text-xs text-muted-foreground text-center">
          Band ID: <span className="font-mono">{activeBandId}</span>
        </p>
      </div>

      {activeBandId && (
        <InviteMembersDialog
          open={inviteDialogOpen}
          onOpenChange={setInviteDialogOpen}
          bandId={activeBandId}
          onInvitesSent={loadInvitations}
        />
      )}

      {/* Remove Member Dialog */}
      <AlertDialog open={!!confirmRemove} onOpenChange={o => { if (!o) { setConfirmRemove(null); setBanOnRemove(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{confirmRemove ? memberName(confirmRemove) : ''}</strong> from the band?
              They will lose access to all band data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 px-6 pb-2">
            <Checkbox
              id="ban-checkbox"
              checked={banOnRemove}
              onCheckedChange={c => setBanOnRemove(!!c)}
            />
            <Label htmlFor="ban-checkbox" className="text-sm font-normal cursor-pointer">
              Also ban this user from re-joining
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleRemove}
            >
              {banOnRemove ? 'Remove & Ban' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Ownership Dialog */}
      <Dialog open={showTransfer} onOpenChange={(open) => {
        setShowTransfer(open);
        if (!open) {
          setConfirmTransfer(false);
          setTransferTarget(null);
          setLeaveAfterTransfer(false);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              Transfer Ownership
            </DialogTitle>
            <DialogDescription>
              Select a member to become the new owner of <strong>{activeBand.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          {!confirmTransfer ? (
            <div className="space-y-4 py-2">
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">⚠ This action is permanent and irreversible.</p>
              </div>

              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {nonOwnerMembers.filter(m => m.isApproved).map(m => (
                  <button
                    key={m.id}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 border rounded-lg text-left transition-colors",
                      transferTarget?.id === m.id ? "border-primary bg-primary/5" : "hover:bg-accent"
                    )}
                    onClick={() => setTransferTarget(m)}
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                      {memberInitials(m)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{memberName(m)}</p>
                      <p className="text-xs text-muted-foreground">{m.user?.email}</p>
                    </div>
                    {transferTarget?.id === m.id && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
                {nonOwnerMembers.filter(m => m.isApproved).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No eligible members to transfer to.</p>
                )}
              </div>

              {transferTarget && (
                <div className="space-y-3 pt-2">
                  <Label className="text-sm font-medium">After transferring, would you like to:</Label>
                  <div className="space-y-2">
                    <button
                      className={cn("w-full p-3 border rounded-lg text-left text-sm transition-colors", !leaveAfterTransfer ? "border-primary bg-primary/5" : "hover:bg-accent")}
                      onClick={() => setLeaveAfterTransfer(false)}
                    >
                      <p className="font-medium">Stay as a regular member</p>
                      <p className="text-xs text-muted-foreground">Your role will change to "member"</p>
                    </button>
                    <button
                      className={cn("w-full p-3 border rounded-lg text-left text-sm transition-colors", leaveAfterTransfer ? "border-primary bg-primary/5" : "hover:bg-accent")}
                      onClick={() => setLeaveAfterTransfer(true)}
                    >
                      <p className="font-medium">Leave the band</p>
                      <p className="text-xs text-muted-foreground">You will be removed from the band</p>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">Please confirm:</p>
                <ul className="text-sm space-y-1 list-disc pl-4">
                  <li><strong>{transferTarget ? memberName(transferTarget) : ''}</strong> will become the new owner</li>
                  <li>You will {leaveAfterTransfer ? 'leave the band' : 'become a regular member'}</li>
                  <li>This cannot be undone</li>
                </ul>
              </div>
            </div>
          )}

          <DialogFooter>
            {!confirmTransfer ? (
              <>
                <Button variant="ghost" onClick={() => setShowTransfer(false)}>Cancel</Button>
                <Button disabled={!transferTarget} onClick={() => setConfirmTransfer(true)}>
                  Continue
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setConfirmTransfer(false)}>Back</Button>
                <Button className="bg-amber-600 hover:bg-amber-700" onClick={handleTransferOwnership} disabled={transferring}>
                  {transferring && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Transfer Ownership
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Band Dialog */}
      <Dialog open={showDelete} onOpenChange={o => { if (!o) { setShowDelete(false); setDeleteStep('confirm'); setDeleteOtp(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Band
            </DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{activeBand.name}</strong> and remove all members.
            </DialogDescription>
          </DialogHeader>

          {deleteStep === 'confirm' ? (
            <div className="space-y-4 py-2">
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">Consider transferring ownership instead</p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  If you just want to leave, you can transfer ownership to another member and keep the band alive.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setShowDelete(false);
                    setShowTransfer(true);
                    setTransferTarget(null);
                    setLeaveAfterTransfer(true);
                  }}
                >
                  <Crown className="h-3.5 w-3.5 mr-1.5" />
                  Transfer & Leave Instead
                </Button>
              </div>

              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                <p className="text-sm text-destructive font-medium">This action cannot be undone.</p>
                <ul className="text-xs text-destructive/80 mt-1 list-disc pl-4 space-y-0.5">
                  <li>All members will be removed</li>
                  <li>Band data will be permanently deleted</li>
                  <li>A verification code will be sent to confirm</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>Verification code sent to <strong>{ownerEmail}</strong></span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="delete-otp">Enter verification code</Label>
                <Input
                  id="delete-otp"
                  value={deleteOtp}
                  onChange={e => setDeleteOtp(e.target.value)}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="font-mono text-center text-lg tracking-widest"
                  autoFocus
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDelete(false)}>Cancel</Button>
            {deleteStep === 'confirm' ? (
              <Button variant="destructive" onClick={handleRequestDeleteOtp} disabled={sendingOtp}>
                {sendingOtp && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Proceed with Deletion
              </Button>
            ) : (
              <Button variant="destructive" onClick={handleDeleteBand} disabled={deletingOtp || deleteOtp.length < 4}>
                {deletingOtp && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Delete Band
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );

  function renderMembersList() {
    if (loading) {
      return (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }
    if (members.length === 0) {
      return <div className="text-center text-muted-foreground text-sm py-8">No members yet.</div>;
    }
    return (
      <div className="bg-card border rounded-xl divide-y overflow-hidden">
        {members.map(m => {
          const isMe = m.userId === user?.id;
          const canEditRole = (isOwner || isManager) && !isMe && m.role !== 'owner';
          const canRemove = (isOwner || isManager) && !isMe && m.role !== 'owner';

          return (
            <div key={m.id} className="flex items-center gap-3 p-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                {memberInitials(m)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{memberName(m)}{isMe && ' (you)'}</p>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0', ROLE_COLORS[m.role])}>
                    {m.role}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {m.position && <span>{m.position}</span>}
                  {m.position && m.user?.email && <span>·</span>}
                  {m.user?.email && <span className="truncate">{m.user.email}</span>}
                </div>
                {m.joinedAt && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <Calendar className="h-3 w-3" />
                    <span>Joined {formatDistanceToNow(new Date(m.joinedAt), { addSuffix: true })}</span>
                  </div>
                )}
              </div>

              {canEditRole && (
                <Select value={m.role} onValueChange={(v) => handleRoleChange(m, v as BandRole)}>
                  <SelectTrigger className="h-8 w-[110px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {canRemove && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive hover:text-destructive h-8 w-8"
                  onClick={() => setConfirmRemove(m)}
                >
                  <UserMinus className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderBannedList() {
    if (bannedUsers.length === 0) {
      return <div className="text-center text-muted-foreground text-sm py-8">No banned users.</div>;
    }
    return (
      <div className="bg-card border rounded-xl divide-y overflow-hidden">
        {bannedUsers.map(b => (
          <div key={b.id} className="flex items-center gap-3 p-3">
            <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center text-destructive font-bold text-xs shrink-0">
              <Ban className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">
                {b.user ? `${b.user.firstName ?? ''} ${b.user.lastName ?? ''}`.trim() : b.userId}
              </p>
              {b.user?.email && (
                <p className="text-xs text-muted-foreground truncate">{b.user.email}</p>
              )}
              {b.reason && (
                <p className="text-xs text-muted-foreground italic">Reason: {b.reason}</p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleUnban(b.userId)}
            >
              Unban
            </Button>
          </div>
        ))}
      </div>
    );
  }
};

export default BandManage;
