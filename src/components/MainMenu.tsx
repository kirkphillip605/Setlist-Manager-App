import { 
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription 
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { 
  Menu, Settings, Shield, User, LogOut, Moon, Sun, 
  Cloud, RefreshCw, CheckCircle2, CloudOff, Radio, Maximize, Minimize,
  ChevronLeft, Layout, Activity, Palette, Volume2, Play,
  Music2, Users
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/context/AuthContext";
import { useBand } from "@/context/BandContext";
import { useTheme } from "@/components/theme-provider";
import { useSyncStatus } from "@/hooks/useSyncedData";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useImmersiveMode } from "@/context/ImmersiveModeContext";
import { Capacitor } from "@capacitor/core";
import { apiPatch } from "@/lib/apiFetch";
import { UserPreferences } from "@/types";
import { useMetronome } from "@/components/MetronomeContext";

interface MainMenuProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trigger?: React.ReactNode;
}

export const MainMenu = ({ open: controlledOpen, onOpenChange: setControlledOpen, trigger }: MainMenuProps) => {
  const navigate = useNavigate();
  const { signOut, isAdmin, profile, refreshProfile } = useAuth();
  const { bands, activeBand, activeBandId, setActiveBand, isManager } = useBand();
  const { setTheme, theme } = useTheme();
  const { isSyncing, lastSyncedAt, refreshAll } = useSyncStatus();
  const isOnline = useNetworkStatus();
  const { isImmersive, toggleImmersive } = useImmersiveMode();
  const { previewSound } = useMetronome();
  
  const [internalOpen, setInternalOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  
  // Navigation within Menu
  const [menuView, setMenuView] = useState<'main' | 'preferences'>('main');

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? setControlledOpen! : setInternalOpen;
  const isAndroid = Capacitor.getPlatform() === 'android';

  // Preferences State
  const [prefs, setPrefs] = useState<UserPreferences>({
      tempo_blinker_enabled: true,
      tempo_blinker_color: 'amber',
      performance_view: 'full',
      metronome_click_sound: 'click1'
  });

  useEffect(() => {
      if (open) {
          // Reset view on open
          setMenuView('main');
      }
  }, [open]);

  useEffect(() => {
      if (profile?.preferences) {
          setPrefs(prev => ({ ...prev, ...profile.preferences }));
      }
  }, [profile]);

  const handleSync = async () => {
    if (!isOnline) return;
    await refreshAll();
    toast.success("Data synchronized");
  };

  const handleSignOut = async () => {
    setShowSignOutConfirm(false);
    setOpen(false);
    await signOut();
    navigate("/login");
  };

  const handleNav = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const savePreference = async (key: keyof UserPreferences, value: any) => {
      const newPrefs = { ...prefs, [key]: value };
      setPrefs(newPrefs); // Optimistic update
      try {
          await apiPatch('/api/users/me', { preferences: newPrefs });
          refreshProfile();
      } catch (e) {
          console.error('Failed to save preference', e);
      }
  };

  const renderMainView = () => (
      <div className="flex-1 overflow-y-auto py-4 px-4 space-y-6 animate-in slide-in-from-left-4 fade-in duration-300">
          {/* App Settings Group */}
          <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">App Settings</h3>
              <div className="space-y-1">
                  <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                      {theme === 'dark' ? "Light Mode" : "Dark Mode"}
                  </Button>
                  
                  {isAndroid && (
                      <Button variant="ghost" className="w-full justify-start gap-3" onClick={toggleImmersive}>
                          {isImmersive ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                          {isImmersive ? "Exit Fullscreen" : "Fullscreen Mode"}
                      </Button>
                  )}

                  <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => setMenuView('preferences')}>
                      <Settings className="h-4 w-4" />
                      Preferences
                  </Button>
              </div>
          </div>

          {/* Band Group */}
          <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">Your Band</h3>
              <div className="space-y-1">
                  {/* Band Switcher */}
                  {bands.length > 0 && (
                    <div className="px-2 py-1">
                      {bands.length === 1 ? (
                        <div className="flex items-center gap-2 text-sm">
                          <Music2 className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium truncate">{activeBand?.name ?? bands[0].name}</span>
                        </div>
                      ) : (
                        <Select value={activeBandId ?? ''} onValueChange={id => { setActiveBand(id); }}>
                          <SelectTrigger className="h-9 w-full bg-muted/40 border-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <Music2 className="h-4 w-4 text-primary shrink-0" />
                              <SelectValue placeholder="Select band" />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {bands.map(b => (
                              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                  {isManager && (
                    <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => handleNav('/bands/manage')}>
                        <Users className="h-4 w-4" />
                        Manage Band
                    </Button>
                  )}
                  <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => handleNav(bands.length === 0 ? '/bands/setup' : '/bands/join')}>
                      <Music2 className="h-4 w-4" />
                      {bands.length === 0 ? 'Create or Join Band' : 'Join Another Band'}
                  </Button>
                  {bands.length > 0 && (
                    <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => handleNav('/bands/setup')}>
                        <Music2 className="h-4 w-4" />
                        Create New Band
                    </Button>
                  )}
              </div>
          </div>

          {/* Admin Group */}
          {isAdmin && (
              <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">Platform Admin</h3>
                  <div className="space-y-1">
                      <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => handleNav("/admin/users")}>
                          <Shield className="h-4 w-4" />
                          Manage Users
                      </Button>
                      <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => handleNav("/admin/sessions")}>
                          <Radio className="h-4 w-4" />
                          Active Sessions
                      </Button>
                  </div>
              </div>
          )}

          {/* Account Group */}
          <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">Account</h3>
              <div className="space-y-1">
                  <Button variant="ghost" className="w-full justify-start gap-3" onClick={() => handleNav("/profile")}>
                      <User className="h-4 w-4" />
                      Profile & Security
                  </Button>
                  <Button variant="ghost" className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setShowSignOutConfirm(true)}>
                      <LogOut className="h-4 w-4" />
                      Sign Out
                  </Button>
              </div>
          </div>
      </div>
  );

  const renderPreferencesView = () => (
      <div className="flex-1 overflow-y-auto py-4 px-4 space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
          <div className="flex items-center gap-2 mb-4">
              <Button variant="ghost" size="icon" className="-ml-2" onClick={() => setMenuView('main')}>
                  <ChevronLeft className="h-5 w-5" />
              </Button>
              <h3 className="font-semibold text-lg">Preferences</h3>
          </div>

          <div className="space-y-6">
              {/* Performance View */}
              <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Layout className="h-4 w-4" /> Performance Mode
                  </div>
                  <div className="bg-muted/30 p-3 rounded-lg border space-y-4">
                      <div className="flex items-center justify-between">
                          <Label htmlFor="view-mode" className="font-normal">View Layout</Label>
                          <Select 
                              value={prefs.performance_view || 'full'} 
                              onValueChange={(val) => savePreference('performance_view', val)}
                          >
                              <SelectTrigger className="w-[120px] h-8 text-xs bg-background">
                                  <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                  <SelectItem value="full">Full (Lyrics)</SelectItem>
                                  <SelectItem value="simple">Simple</SelectItem>
                              </SelectContent>
                          </Select>
                      </div>
                      <p className="text-xs text-muted-foreground">
                          "Simple" view hides lyrics and maximizes Title, Key, and Tempo for better visibility.
                      </p>
                  </div>
              </div>

              {/* Metronome Sound */}
              <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Volume2 className="h-4 w-4" /> Metronome Sound
                  </div>
                  <div className="bg-muted/30 p-3 rounded-lg border space-y-4">
                      <div className="flex items-center gap-2">
                          <div className="flex-1">
                              <Label htmlFor="click-sound" className="font-normal block mb-1">Click Tone</Label>
                              <Select 
                                  value={prefs.metronome_click_sound || 'click1'} 
                                  onValueChange={(val) => savePreference('metronome_click_sound', val)}
                              >
                                  <SelectTrigger className="w-full h-9 text-xs bg-background">
                                      <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                      <SelectItem value="click1">Click 1 (Default)</SelectItem>
                                      <SelectItem value="click2">Click 2 (High)</SelectItem>
                                      <SelectItem value="click3">Click 3 (Low)</SelectItem>
                                      <SelectItem value="click4">Click 4 (Sharp)</SelectItem>
                                      <SelectItem value="click5">Click 5 (Ping)</SelectItem>
                                  </SelectContent>
                              </Select>
                          </div>
                          <div className="flex flex-col justify-end">
                              <Button 
                                  variant="outline" 
                                  size="icon" 
                                  className="h-9 w-9 shrink-0" 
                                  onClick={() => previewSound(prefs.metronome_click_sound || 'click1')}
                                  title="Preview Sound"
                              >
                                  <Play className="h-4 w-4" />
                              </Button>
                          </div>
                      </div>
                  </div>
              </div>

              {/* Tempo Indicator */}
              <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Activity className="h-4 w-4" /> Tempo Indicator
                  </div>
                  <div className="bg-muted/30 p-3 rounded-lg border space-y-4">
                      <div className="flex items-center justify-between">
                          <Label htmlFor="blinker-toggle" className="font-normal">Show Blinker</Label>
                          <Switch 
                              id="blinker-toggle"
                              checked={prefs.tempo_blinker_enabled !== false}
                              onCheckedChange={(c) => savePreference('tempo_blinker_enabled', c)}
                          />
                      </div>
                      
                      <div className="space-y-2">
                          <div className="flex items-center gap-2">
                              <Palette className="h-3 w-3 text-muted-foreground" />
                              <Label className="text-xs font-normal">Indicator Color</Label>
                          </div>
                          <div className="flex gap-2">
                              {['red', 'amber', 'green', 'blue', 'purple', 'white'].map(color => (
                                  <button
                                      key={color}
                                      onClick={() => savePreference('tempo_blinker_color', color)}
                                      className={cn(
                                          "w-6 h-6 rounded-full border-2 transition-all",
                                          prefs.tempo_blinker_color === color ? "border-foreground scale-110" : "border-transparent opacity-70 hover:opacity-100",
                                          {
                                              'bg-red-500': color === 'red',
                                              'bg-amber-500': color === 'amber',
                                              'bg-green-500': color === 'green',
                                              'bg-blue-500': color === 'blue',
                                              'bg-purple-500': color === 'purple',
                                              'bg-white': color === 'white',
                                          }
                                      )}
                                  />
                              ))}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      </div>
  );

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          {trigger || (
            <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-6 w-6" />
            </Button>
          )}
        </SheetTrigger>
        <SheetContent side="right" className="w-[300px] sm:w-[350px] flex flex-col gap-0 p-0">
          
          {/* Header / Sync Status Area */}
          <div className="bg-primary/10 border-b p-6 pt-10">
            <SheetHeader className="mb-4 text-left">
              <SheetTitle className="flex items-center gap-2">
                 Menu
              </SheetTitle>
              <SheetDescription className="hidden">Main Navigation</SheetDescription>
            </SheetHeader>

            <div className="bg-background/50 backdrop-blur rounded-lg p-3 border shadow-sm">
               <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                      {isOnline ? <Cloud className="h-4 w-4 text-primary" /> : <CloudOff className="h-4 w-4 text-muted-foreground" />}
                      {isOnline ? "Cloud Sync" : "Offline"}
                  </div>
                  <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0 hover:bg-background" 
                      onClick={handleSync}
                      disabled={!isOnline || isSyncing}
                  >
                      <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
                  </Button>
               </div>
               
               <div className="text-xs text-muted-foreground">
                  {isSyncing ? (
                      <span className="text-primary flex items-center gap-1">Syncing changes...</span>
                  ) : (
                      <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          Last synced {lastSyncedAt > 0 ? formatDistanceToNow(lastSyncedAt, { addSuffix: true }) : 'Never'}
                      </span>
                  )}
               </div>
            </div>
          </div>

          {/* Menu Items Area */}
          {menuView === 'main' ? renderMainView() : renderPreferencesView()}
          
          {/* Footer info */}
          <div className="p-4 text-center text-xs text-muted-foreground border-t bg-muted/10">
              Setlist Manager Pro v3.0
          </div>

        </SheetContent>
      </Sheet>

      <AlertDialog open={showSignOutConfirm} onOpenChange={setShowSignOutConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign Out</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to sign out? This will clear your local data cache.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOut} className="bg-destructive hover:bg-destructive/90">Sign Out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};