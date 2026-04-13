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
import { apiDel } from '@/lib/apiFetch';
import { updateUserProfile, changeUserPassword, twoFactor, listUserAccounts, unlinkAccount } from '@/lib/authClient';
import { authClient } from '@/lib/authClient';
import type { AuthUser } from '@/lib/authClient';
import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, LogOut, ShieldAlert, Cloud, Trash2, Shield, ShieldCheck, ShieldOff, Link2, Phone, Camera, Copy, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSyncStatus } from '@/hooks/useSyncedData';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { LoadingDialog } from '@/components/LoadingDialog';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';

type UserWithExtended = AuthUser & {
  phone?: string | null;
  phoneVerified?: boolean;
  twoFactorEnabled?: boolean;
};

const Profile = () => {
  const navigate  = useNavigate();
  const { user, profile: ctxProfile, signOut, refreshProfile } = useAuth();

  const { lastSyncedAt, isSyncing } = useSyncStatus();
  const isOnline = useNetworkStatus();

  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [saving, setSaving]       = useState(false);

  const [currentPw,  setCurrentPw]  = useState('');
  const [newPw,      setNewPw]      = useState('');
  const [confirmPw,  setConfirmPw]  = useState('');
  const [pwSaving,   setPwSaving]   = useState(false);

  const [isDeleteOpen,       setIsDeleteOpen]       = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisable2FA, setShowDisable2FA] = useState(false);

  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [backupCodesPassword, setBackupCodesPassword] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [backupCodesLoading, setBackupCodesLoading] = useState(false);

  const [linkedAccounts, setLinkedAccounts] = useState<Array<{ id: string; providerId: string; accountId: string }>>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);

  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const lastPhoneOtpSendTime = useRef<number>(0);
  const PHONE_OTP_COOLDOWN_MS = 30000;

  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ctxProfile) {
      setFirstName(ctxProfile.firstName ?? '');
      setLastName(ctxProfile.lastName  ?? '');
    }
  }, [ctxProfile]);

  useEffect(() => {
    if (user) {
      const u = user as UserWithExtended;
      setPhoneNumber(u.phone ?? '');
      setPhoneVerified(u.phoneVerified ?? false);
      setTwoFactorEnabled(u.twoFactorEnabled ?? false);
    }
  }, [user]);

  useEffect(() => {
    listUserAccounts().then(result => {
      if (result?.data?.accounts) {
        setLinkedAccounts(result.data.accounts);
      }
    }).catch(() => {}).finally(() => setAccountsLoading(false));
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setAvatarUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const result = await updateUserProfile({ image: dataUrl });
      if (result?.error) {
        toast.error(result.error.message ?? 'Failed to update avatar');
      } else {
        await refreshProfile();
        toast.success('Avatar updated!');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await updateUserProfile({
        name: `${firstName.trim()} ${lastName.trim()}`,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      if (result?.error) {
        throw new Error(result.error.message ?? 'Failed to update profile');
      }
      await refreshProfile();
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error('Failed to update profile: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    if (newPw.length < 8)    { toast.error('Password must be at least 8 characters'); return; }
    setPwSaving(true);
    try {
      const result = await changeUserPassword({
        currentPassword: currentPw,
        newPassword:     newPw,
        revokeOtherSessions: false,
      });
      const error = result?.error;
      if (error) throw new Error(error.message ?? 'Failed to update password');
      toast.success('Password updated successfully');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setPwSaving(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!disablePassword.trim()) {
      toast.error('Please enter your password');
      return;
    }
    setTwoFactorLoading(true);
    try {
      const result = await twoFactor.disable({ password: disablePassword });
      if (result?.error) {
        toast.error(result.error.message ?? 'Failed to disable 2FA');
      } else {
        setTwoFactorEnabled(false);
        setShowDisable2FA(false);
        setDisablePassword('');
        toast.success('Two-factor authentication disabled');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleViewBackupCodes = async () => {
    if (!backupCodesPassword.trim()) {
      toast.error('Please enter your password');
      return;
    }
    setBackupCodesLoading(true);
    try {
      const result = await twoFactor.getBackupCodes({ password: backupCodesPassword });
      if (result?.error) {
        toast.error(result.error.message ?? 'Failed to get backup codes');
      } else if (result?.data?.backupCodes) {
        setBackupCodes(result.data.backupCodes);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to get backup codes');
    } finally {
      setBackupCodesLoading(false);
    }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    toast.success('Backup codes copied to clipboard');
  };

  const handleRegenerateBackupCodes = async () => {
    if (!backupCodesPassword.trim()) {
      toast.error('Please enter your password first');
      return;
    }
    setBackupCodesLoading(true);
    try {
      const result = await twoFactor.regenerateBackupCodes({ password: backupCodesPassword });
      if (result?.error) {
        toast.error(result.error.message ?? 'Failed to regenerate backup codes');
      } else if (result?.data?.backupCodes) {
        setBackupCodes(result.data.backupCodes);
        toast.success('New backup codes generated');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to regenerate backup codes');
    } finally {
      setBackupCodesLoading(false);
    }
  };

  const handleUnlinkAccount = async (providerId: string) => {
    if (linkedAccounts.length <= 1) {
      toast.error('You must keep at least one sign-in method');
      return;
    }
    setSaving(true);
    try {
      const result = await unlinkAccount({ providerId });
      if (result?.error) {
        toast.error(result.error.message ?? 'Failed to unlink account');
      } else {
        setLinkedAccounts(prev => prev.filter(a => a.providerId !== providerId));
        toast.success('Account unlinked successfully');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unlink account');
    } finally {
      setSaving(false);
    }
  };

  const canSendPhoneOtp = () => {
    return Date.now() - lastPhoneOtpSendTime.current >= PHONE_OTP_COOLDOWN_MS;
  };

  const handleSendPhoneOtp = async () => {
    if (!phoneNumber.trim()) {
      toast.error('Please enter a phone number');
      return;
    }
    if (!canSendPhoneOtp()) {
      toast.error('Please wait before requesting another code');
      return;
    }
    setPhoneLoading(true);
    try {
      const { error } = await authClient.phoneNumber.sendOtp({
        phoneNumber: phoneNumber.trim(),
      });
      if (error) throw new Error(error.message ?? 'Failed to send code');
      lastPhoneOtpSendTime.current = Date.now();
      setPhoneOtpSent(true);
      toast.success('Verification code sent!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyPhone = async () => {
    if (phoneOtp.length < 6) {
      toast.error('Please enter the full code');
      return;
    }
    setPhoneLoading(true);
    try {
      const { error } = await authClient.phoneNumber.verify({
        phoneNumber: phoneNumber.trim(),
        code: phoneOtp,
      });
      if (error) throw new Error(error.message ?? 'Verification failed');
      setPhoneVerified(true);
      setPhoneOtpSent(false);
      setPhoneOtp('');
      await refreshProfile();
      toast.success('Phone number verified!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleteOpen(false);
    setSaving(true);
    try {
      await apiDel('/api/users/me');
      toast.success('Account deactivated.');
      await signOut();
      navigate('/login');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Failed to deactivate account: ' + message);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    setShowSignOutConfirm(false);
    await signOut();
    navigate('/login');
  };

  const providerLabel = (id: string) => {
    switch (id) {
      case 'google': return 'Google';
      case 'credential': return 'Email & Password';
      default: return id;
    }
  };

  const avatarUrl = ctxProfile?.avatarUrl || user?.image;

  return (
    <AppLayout>
      <LoadingDialog open={saving} />
      <div className="space-y-6 max-w-2xl mx-auto pb-20">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile & Security</h1>
          <p className="text-muted-foreground">Manage your personal information and account security.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Personal Details</CardTitle>
            <CardDescription>Your name and avatar are visible to other band members.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="flex items-center gap-4 mb-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-border">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-muted-foreground">
                        {(firstName || user?.email || '?')[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="absolute -bottom-1 -right-1 p-1 bg-primary rounded-full text-primary-foreground hover:bg-primary/90 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarUploading}
                  >
                    {avatarUploading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Camera className="h-3 w-3" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  Click the camera icon to upload a new avatar
                </div>
              </div>
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5 text-blue-500" />
              Linked Accounts
            </CardTitle>
            <CardDescription>Manage your connected sign-in methods.</CardDescription>
          </CardHeader>
          <CardContent>
            {accountsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading...
              </div>
            ) : linkedAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No linked accounts found.</p>
            ) : (
              <div className="space-y-3">
                {linkedAccounts.map(account => (
                  <div key={account.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="text-sm font-medium">{providerLabel(account.providerId)}</p>
                      <p className="text-xs text-muted-foreground">{account.accountId}</p>
                    </div>
                    {account.providerId !== 'credential' && linkedAccounts.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleUnlinkAccount(account.providerId)}
                      >
                        Unlink
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-green-500" />
              Phone Number
            </CardTitle>
            <CardDescription>Add and verify your phone number.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <div className="flex gap-2">
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={phoneNumber}
                  onChange={e => {
                    setPhoneNumber(e.target.value);
                    setPhoneVerified(false);
                    setPhoneOtpSent(false);
                  }}
                  className="flex-1"
                />
                {phoneVerified ? (
                  <span className="inline-flex items-center text-xs text-green-600 font-medium px-2">Verified</span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={phoneLoading || !phoneNumber.trim()}
                    onClick={handleSendPhoneOtp}
                  >
                    {phoneLoading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    Verify
                  </Button>
                )}
              </div>
            </div>
            {phoneOtpSent && !phoneVerified && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Enter the verification code sent to your phone:</p>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={phoneOtp} onChange={setPhoneOtp}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <div className="flex gap-2 justify-center">
                  <Button
                    size="sm"
                    disabled={phoneLoading || phoneOtp.length < 6}
                    onClick={handleVerifyPhone}
                  >
                    {phoneLoading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    Confirm
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!canSendPhoneOtp()}
                    onClick={handleSendPhoneOtp}
                  >
                    Resend
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {twoFactorEnabled
                ? <ShieldCheck className="w-5 h-5 text-green-500" />
                : <Shield className="w-5 h-5 text-orange-500" />}
              Two-Factor Authentication
            </CardTitle>
            <CardDescription>
              {twoFactorEnabled
                ? 'Your account is protected with 2FA.'
                : 'Add an extra layer of security to your account.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {twoFactorEnabled ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <ShieldCheck className="h-4 w-4" />
                  Two-factor authentication is enabled
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => { setShowBackupCodes(true); setBackupCodes([]); setBackupCodesPassword(''); }}
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    View Backup Codes
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive"
                    onClick={() => setShowDisable2FA(true)}
                  >
                    <ShieldOff className="mr-2 h-4 w-4" />
                    Disable 2FA
                  </Button>
                </div>

                <Dialog open={showBackupCodes} onOpenChange={setShowBackupCodes}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Backup Codes</DialogTitle>
                      <DialogDescription>
                        {backupCodes.length > 0
                          ? 'Store these codes in a safe place. Each code can only be used once.'
                          : 'Enter your password to view your backup codes.'}
                      </DialogDescription>
                    </DialogHeader>
                    {backupCodes.length === 0 ? (
                      <div className="space-y-4 py-2">
                        <div className="space-y-2">
                          <Label htmlFor="backup-pw">Password</Label>
                          <Input
                            id="backup-pw"
                            type="password"
                            value={backupCodesPassword}
                            onChange={e => setBackupCodesPassword(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <Button onClick={handleViewBackupCodes} disabled={backupCodesLoading || !backupCodesPassword.trim()} className="w-full">
                          {backupCodesLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          View Codes
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4 py-2">
                        <div className="bg-muted rounded-lg p-4 font-mono text-sm space-y-1">
                          {backupCodes.map((code, i) => (
                            <div key={i} className="text-center">{code}</div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1" onClick={copyBackupCodes}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy Codes
                          </Button>
                          <Button variant="outline" className="flex-1" onClick={handleRegenerateBackupCodes} disabled={backupCodesLoading}>
                            {backupCodesLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Regenerate
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                          Regenerating will invalidate your current backup codes.
                        </p>
                      </div>
                    )}
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setShowBackupCodes(false)}>Close</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={showDisable2FA} onOpenChange={setShowDisable2FA}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
                      <DialogDescription>
                        Enter your password to disable 2FA. This will make your account less secure.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-2">
                        <Label htmlFor="disable-2fa-pw">Password</Label>
                        <Input
                          id="disable-2fa-pw"
                          type="password"
                          value={disablePassword}
                          onChange={e => setDisablePassword(e.target.value)}
                          autoFocus
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => { setShowDisable2FA(false); setDisablePassword(''); }}>Cancel</Button>
                      <Button variant="destructive" onClick={handleDisable2FA} disabled={twoFactorLoading || !disablePassword.trim()}>
                        {twoFactorLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Disable 2FA
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            ) : (
              <Button onClick={() => navigate('/2fa-setup')}>
                <Shield className="mr-2 h-4 w-4" />
                Enable 2FA
              </Button>
            )}
          </CardContent>
        </Card>

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
