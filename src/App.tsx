import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MetronomeProvider } from '@/components/MetronomeContext';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';

import Index              from './pages/Index';
import Login              from './pages/Login';
import AuthCallback       from './pages/AuthCallback';
import UpdatePassword     from './pages/UpdatePassword';
import VerifyEmail        from './pages/VerifyEmail';
import OnboardingWizard   from './pages/OnboardingWizard';
import TwoFactorSetup     from './pages/TwoFactorSetup';
import TwoFactorChallenge from './pages/TwoFactorChallenge';
import SongList           from './pages/SongList';
import SongEdit           from './pages/SongEdit';
import SongDetail         from './pages/SongDetail';
import Setlists           from './pages/Setlists';
import SetlistDetail      from './pages/SetlistDetail';
import Gigs               from './pages/Gigs';
import GigDetail          from './pages/GigDetail';
import Profile            from './pages/Profile';
import AdminUsers         from './pages/AdminUsers';
import AdminSessions      from './pages/AdminSessions';
import PerformanceSelection from './pages/PerformanceSelection';
import PerformanceMode    from './pages/PerformanceMode';
import NotFound           from './pages/NotFound';
import PendingApproval    from './pages/PendingApproval';
import ReactivateAccount  from './pages/ReactivateAccount';
import BandSetup          from './pages/BandSetup';
import BandManage         from './pages/BandManage';

import { queryClient, persister } from '@/lib/queryClient';
import { SyncIndicator } from '@/components/SyncIndicator';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { BandProvider, useBand } from '@/context/BandContext';
import { DataHydration } from '@/components/DataHydration';
import ScrollToTop from '@/components/ScrollToTop';
import { ImmersiveModeProvider } from '@/context/ImmersiveModeContext';
import { useAppStatus } from '@/hooks/useAppStatus';
import { SystemStatusScreen } from '@/components/SystemStatusScreen';
import { MobileAppSuggestion } from '@/components/MobileAppSuggestion';
import { storageAdapter } from '@/lib/storageAdapter';
import { MetronomeRouteHandler } from '@/components/MetronomeRouteHandler';

// ── Protected Route ───────────────────────────────────────────────
const ProtectedRoute = ({ children, requireBand = true }: { children: JSX.Element; requireBand?: boolean }) => {
  const { user, loading, profile } = useAuth();
  const { noBands, bandsLoading } = useBand();
  const location = useLocation();

  if (loading || bandsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Inactive account (soft-deleted)
  if (profile && !profile.is_active) {
    if (location.pathname !== '/reactivate') return <Navigate to="/reactivate" replace />;
    return children;
  }

  const isProfileComplete = profile?.is_profile_complete || (profile && profile.first_name && profile.last_name);

  if (!isProfileComplete) {
    if (location.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />;
    return children;
  }

  // No bands yet → direct to band setup
  if (requireBand && noBands) {
    if (location.pathname !== '/bands/setup') return <Navigate to="/bands/setup" replace />;
    return children;
  }

  // Redirect away from special pages once conditions are met
  if (location.pathname === '/reactivate' && profile?.is_active) return <Navigate to="/" replace />;
  if (location.pathname === '/onboarding' && isProfileComplete)   return <Navigate to="/" replace />;
  if (location.pathname === '/bands/setup' && !noBands)           return <Navigate to="/" replace />;

  return <DataHydration>{children}</DataHydration>;
};

// ── Public-Only Route ─────────────────────────────────────────────
const PublicOnlyRoute = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (user) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }
  return children;
};

// ── App Content ───────────────────────────────────────────────────
const AppContent = () => {
  useEffect(() => {
    CapacitorApp.addListener('appUrlOpen', async (event) => {
      // BetterAuth OAuth callback: redirect the WebView to the callback URL
      if (event.url.includes('auth/callback') || event.url.includes('google-auth')) {
        try {
          const url = new URL(event.url);
          // Navigate the web view to the callback path so BetterAuth can process it
          if (url.pathname.startsWith('/auth/callback')) {
            window.location.href = event.url;
          }
        } catch (e) {
          console.error('[Auth] Failed to parse deep link URL:', e);
        }
      }
    });
    return () => { CapacitorApp.removeAllListeners(); };
  }, []);

  return (
    <>
      <ScrollToTop />
      <MetronomeRouteHandler />
      <Routes>
        <Route path="/login"            element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/auth/callback"    element={<AuthCallback />} />
        <Route path="/verify-email"     element={<PublicOnlyRoute><VerifyEmail /></PublicOnlyRoute>} />
        <Route path="/update-password"  element={<UpdatePassword />} />

        <Route path="/onboarding"       element={<ProtectedRoute requireBand={false}><OnboardingWizard /></ProtectedRoute>} />
        <Route path="/2fa-setup"        element={<ProtectedRoute requireBand={false}><TwoFactorSetup /></ProtectedRoute>} />
        <Route path="/2fa-challenge"    element={<TwoFactorChallenge />} />
        <Route path="/pending"          element={<ProtectedRoute requireBand={false}><PendingApproval /></ProtectedRoute>} />
        <Route path="/reactivate"       element={<ProtectedRoute requireBand={false}><ReactivateAccount /></ProtectedRoute>} />
        <Route path="/bands/setup"      element={<ProtectedRoute requireBand={false}><BandSetup /></ProtectedRoute>} />
        <Route path="/bands/manage"     element={<ProtectedRoute><BandManage /></ProtectedRoute>} />

        <Route path="/"                 element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/songs"            element={<ProtectedRoute><SongList /></ProtectedRoute>} />
        <Route path="/songs/new"        element={<ProtectedRoute><SongEdit /></ProtectedRoute>} />
        <Route path="/songs/:id"        element={<ProtectedRoute><SongDetail /></ProtectedRoute>} />
        <Route path="/songs/:id/edit"   element={<ProtectedRoute><SongEdit /></ProtectedRoute>} />
        <Route path="/setlists"         element={<ProtectedRoute><Setlists /></ProtectedRoute>} />
        <Route path="/setlists/:id"     element={<ProtectedRoute><SetlistDetail /></ProtectedRoute>} />
        <Route path="/gigs"             element={<ProtectedRoute><Gigs /></ProtectedRoute>} />
        <Route path="/gigs/:id"         element={<ProtectedRoute><GigDetail /></ProtectedRoute>} />

        <Route path="/performance"      element={<ProtectedRoute><PerformanceSelection /></ProtectedRoute>} />
        <Route path="/performance/:id"  element={<ProtectedRoute><PerformanceMode /></ProtectedRoute>} />

        <Route path="/profile"          element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/admin/users"      element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
        <Route path="/admin/sessions"   element={<ProtectedRoute><AdminSessions /></ProtectedRoute>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};

// ── App Status Wrapper ────────────────────────────────────────────
const AppStatusWrapper = () => {
  const { isMaintenance, isUpdateRequired, statusData, loading } = useAppStatus();
  const [showSuggestion, setShowSuggestion] = useState(false);

  useEffect(() => {
    storageAdapter.getItem('dismissed_mobile_app_suggestion').then(dismissed => {
      if (!dismissed) setShowSuggestion(true);
    });
  }, []);

  const handleDismissSuggestion = () => {
    setShowSuggestion(false);
    void storageAdapter.setItem('dismissed_mobile_app_suggestion', 'true');
  };

  if (loading) return null;
  if (isUpdateRequired) return <SystemStatusScreen status={statusData} mode="update" />;
  if (isMaintenance)    return <SystemStatusScreen status={statusData} mode="maintenance" />;

  return (
    <BrowserRouter>
      {showSuggestion && <MobileAppSuggestion onDismiss={handleDismissSuggestion} />}
      <AppContent />
    </BrowserRouter>
  );
};

// ── Root App ──────────────────────────────────────────────────────
const App = () => (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{ persister }}
    onSuccess={() => console.log('App data restored from offline cache')}
  >
    <TooltipProvider>
      <AuthProvider>
        <BandProvider>
          <ImmersiveModeProvider>
            <MetronomeProvider>
              <Toaster />
              <Sonner
                position="top-center"
                closeButton
                toastOptions={{
                  className: 'mt-12 md:mt-4',
                  style: { margin: '0 auto' },
                }}
              />
              <SyncIndicator />
              <AppStatusWrapper />
            </MetronomeProvider>
          </ImmersiveModeProvider>
        </BandProvider>
      </AuthProvider>
    </TooltipProvider>
  </PersistQueryClientProvider>
);

export default App;
