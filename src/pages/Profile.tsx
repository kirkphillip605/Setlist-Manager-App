import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { apiFetch } from '@/lib/apiFetch';
import { authClient } from '@/lib/authClient';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, LogOut, ShieldAlert, Cloud, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSyncStatus } from '@/hooks/useSyncedData';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { LoadingDialog } from '@/components/LoadingDialog';

const Profile = () => {
  const navigate  = useNavigate();
  const { user, profile: ctxProfile, signOut, refreshProfile } = useAuth();

  const { lastSyncedAt, isSyncing } = useSyncStatus();
  const isOnline = useNetworkStatus();

  // Local profile form state (seeded from context)
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [saving, setSaving]       = useState(false);

  // Password-change state
  const [currentPw,  setCurrentPw]  = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [confirmPw,  setConfirmPw]  = useState('');
  const [pwSaving,   setPwSaving]   = useState(false);

  // Delete / signout dialogs
  const [isDeleteOpen,       setIsDeleteOpen]       = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  useEffect(() => {
    if (ctxProfile) {
      setFirstName(ctxProfile.first_name ?? '');
      setLastName(ctxProfile.last_name  ?? '');
    }
  }, [ctxProfile]);

  // ── Profile update ──────────────────────────────────────────────
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('PATCH', '/api/users/me', {
        first_name: firstName.trim(),
        last_name:  lastName.trim(),
      });
      await refreshProfile();
      toast.success('Profile updated successfully');
    } catch (err: any) {
      toast.error('Failed to update profile: ' + (err?.message ?? 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  // ── Password change ─────────────────────────────────────────────
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    if (newPw.length < 8)    { toast.error('Password must be at least 8 characters'); return; }
    setPwSaving(true);
    try {
      const { error } = await (authClient as any).changePassword({
        currentPassword: currentPw,
        newPassword:     newPw,
        revokeOtherSessions: false,
      });
      if (error) throw new Error(error.message ?? 'Failed to update password');
      toast.success('Password updated successfully');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update password');
    } finally {
      setPwSaving(false);
    }
  };

  // ── Account deactivation ────────────────────────────────────────
  const handleDeleteAccount = async () => {
    setIsDeleteOpen(false);
    setSaving(true);
    try {
      await apiFetch('DELETE', '/api/users/me');
      toast.success('Account deactivated.');
      await signOut();
      navigate('/login');
    } catch (err: any) {
      toast.error('Failed to deactivate account: ' + (err?.message ?? 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    setShowSignOutConfirm(false);
    await signOut();
    navigate('/login');
  };

  return (
    <AppLayout>
      <LoadingDialog open={saving} />
      <div className="space-y-6 max-w-2xl mx-auto pb-20">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile &amp; Security</h1>
          <p className="text-muted-foreground">Manage your personal information and account security.</p>
        </div>

        {/* ── Personal Details ───────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Details</CardTitle>
            <CardDescription>Your name is visible to other band members.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={user?.email ?? ''} disabled className="bg-muted/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" value={lastName} onChange={e => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ── Sync Status ────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="w-5 h-5 text-blue-500" />
              Data Sync
            </CardTitle>
            <CardDescription>Manage your offline data cache.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-sm font-medium">Network Status</div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', isOnline ? 'bg-green-500' : 'bg-red-500')} />
                  {isOnline ? 'Online' : 'Offline'}
                </div>
              </div>
              <div className="space-y-1 text-right">
                <div className="text-sm font-medium">Last Synced</div>
                <div className="text-sm text-muted-foreground">
                  {lastSyncedAt > 0 ? new Date(lastSyncedAt).toLocaleString() : 'Never'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Security / Password ─────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-orange-500" />
              Security
            </CardTitle>
            <CardDescription>Change your account password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPw">Current Password</Label>
                <Input id="currentPw" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPw">New Password</Label>
                <Input id="newPw" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPw">Confirm New Password</Label>
                <Input id="confirmPw" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="secondary" disabled={pwSaving || !currentPw || !newPw}>
                  {pwSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update Password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* ── Delete Account ──────────────────────────────────────── */}
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Delete Account
            </CardTitle>
            <CardDescription>Permanently deactivate your access.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Deleting your account will remove your personal data. Any band content you created (songs, setlists, gigs) will remain for the band.
            </p>
            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" className="w-full">Delete My Account</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Are you absolutely sure?</DialogTitle>
                  <DialogDescription>
                    This deactivates your account. You will be signed out immediately.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setIsDeleteOpen(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={handleDeleteAccount}>Yes, Delete Account</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* ── Sign Out ─────────────────────────────────────────────── */}
        <div className="pt-4 flex justify-center">
          <Button variant="ghost" onClick={() => setShowSignOutConfirm(true)} className="text-muted-foreground">
            <LogOut className="mr-2 h-4 w-4" /> Sign Out
          </Button>
        </div>

        <AlertDialog open={showSignOutConfirm} onOpenChange={setShowSignOutConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign Out</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to sign out?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSignOut} className="bg-destructive hover:bg-destructive/90">Sign Out</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
};

export default Profile;
