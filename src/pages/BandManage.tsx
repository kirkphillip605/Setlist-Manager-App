import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useBand } from '@/context/BandContext';
import {
  getBandMembers, getPendingMembers,
  approveMember, denyMember,
  updateMemberRole, removeMember,
  regenerateJoinCode, updateBand,
} from '@/lib/api';
import type { BandMembership, BandRole } from '@/types';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Copy, RefreshCw, Check, Users, Shield, UserX, Loader2,
  ChevronLeft, UserCheck, UserMinus,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ROLE_COLORS: Record<BandRole, string> = {
  owner:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  member:  'bg-muted text-muted-foreground',
};

const BandManage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeBand, activeBandId, isOwner, isManager, refreshBands } = useBand();

  const [members, setMembers]       = useState<BandMembership[]>([]);
  const [pending, setPending]       = useState<BandMembership[]>([]);
  const [loading, setLoading]       = useState(true);
  const [copied, setCopied]         = useState(false);
  const [joinCode, setJoinCode]     = useState(activeBand?.join_code ?? '');
  const [regenLoading, setRegen]    = useState(false);

  const [editName, setEditName]       = useState(activeBand?.name ?? '');
  const [editDesc, setEditDesc]       = useState(activeBand?.description ?? '');
  const [savingInfo, setSavingInfo]   = useState(false);

  const [confirmRemove, setConfirmRemove] = useState<BandMembership | null>(null);

  const load = useCallback(async () => {
    if (!activeBandId) return;
    setLoading(true);
    try {
      const [m, p] = await Promise.all([
        getBandMembers(activeBandId),
        isManager ? getPendingMembers(activeBandId) : Promise.resolve([]),
      ]);
      setMembers(m ?? []);
      setPending(p ?? []);
    } catch {
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [activeBandId, isManager]);

  useEffect(() => {
    setEditName(activeBand?.name ?? '');
    setEditDesc(activeBand?.description ?? '');
    setJoinCode(activeBand?.join_code ?? '');
  }, [activeBand]);

  useEffect(() => { void load(); }, [load]);

  const copyCode = () => {
    if (!joinCode) return;
    navigator.clipboard.writeText(joinCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  const handleApprove = async (m: BandMembership) => {
    if (!activeBandId) return;
    try {
      await approveMember(activeBandId, m.id);
      toast.success(`${m.user?.first_name ?? 'Member'} approved`);
      void load();
    } catch {
      toast.error('Failed to approve member');
    }
  };

  const handleDeny = async (m: BandMembership) => {
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
      await updateMemberRole(activeBandId, m.user_id, role, m.position ?? undefined);
      toast.success('Role updated');
      void load();
    } catch {
      toast.error('Failed to update role');
    }
  };

  const handleRemove = async () => {
    if (!activeBandId || !confirmRemove) return;
    try {
      await removeMember(activeBandId, confirmRemove.user_id);
      toast.success('Member removed');
      setConfirmRemove(null);
      void load();
    } catch {
      toast.error('Failed to remove member');
    }
  };

  const memberName = (m: BandMembership) =>
    m.user ? `${m.user.first_name ?? ''} ${m.user.last_name ?? ''}`.trim() : m.user_id;

  if (!activeBand) {
    return (
      <AppLayout>
        <div className="p-4 text-center text-muted-foreground">No active band selected.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container max-w-2xl mx-auto p-4 space-y-6 pb-20">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="-ml-2">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Band Management</h1>
        </div>

        {/* Band Info */}
        {isManager && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Shield className="h-4 w-4" /> Band Info
            </h2>
            <div className="space-y-3 bg-card border rounded-xl p-4">
              <div className="space-y-1">
                <Label htmlFor="edit-name">Band Name</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  disabled={!isOwner}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-desc">Description</Label>
                <Input
                  id="edit-desc"
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  placeholder="Optional"
                  disabled={!isOwner}
                />
              </div>
              {isOwner && (
                <Button onClick={handleSaveInfo} disabled={savingInfo} size="sm">
                  {savingInfo ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Save
                </Button>
              )}
            </div>
          </section>
        )}

        {/* Join Code */}
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
              {isOwner && (
                <Button variant="outline" size="sm" onClick={handleRegen} disabled={regenLoading}>
                  {regenLoading
                    ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    : <RefreshCw className="h-4 w-4 mr-2" />}
                  Regenerate Code
                </Button>
              )}
            </div>
          </section>
        )}

        {/* Pending Requests */}
        {isManager && pending.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <UserCheck className="h-4 w-4" /> Pending Requests ({pending.length})
            </h2>
            <div className="bg-card border rounded-xl divide-y overflow-hidden">
              {pending.map(m => (
                <div key={m.id} className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{memberName(m)}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.user?.email}</p>
                  </div>
                  <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950" onClick={() => handleApprove(m)}>
                    <UserCheck className="h-3.5 w-3.5 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDeny(m)}>
                    <UserX className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Members */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Users className="h-4 w-4" /> Members ({members.length})
          </h2>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">No members yet.</div>
          ) : (
            <div className="bg-card border rounded-xl divide-y overflow-hidden">
              {members.map(m => {
                const isMe = m.user_id === user?.id;
                const canEdit = isOwner && !isMe && m.role !== 'owner';
                return (
                  <div key={m.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{memberName(m)}{isMe && ' (you)'}</p>
                        <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', ROLE_COLORS[m.role])}>
                          {m.role}
                        </span>
                      </div>
                      {m.position && (
                        <p className="text-xs text-muted-foreground">{m.position}</p>
                      )}
                    </div>

                    {canEdit && (
                      <>
                        <Select value={m.role} onValueChange={(v) => handleRoleChange(m, v as BandRole)}>
                          <SelectTrigger className="h-8 w-[110px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive h-8 w-8"
                          onClick={() => setConfirmRemove(m)}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <Separator />

        <p className="text-xs text-muted-foreground text-center">
          Band ID: <span className="font-mono">{activeBandId}</span>
        </p>
      </div>

      <AlertDialog open={!!confirmRemove} onOpenChange={o => !o && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{confirmRemove ? memberName(confirmRemove) : ''}</strong> from the band?
              They will lose access to all band data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleRemove}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default BandManage;
