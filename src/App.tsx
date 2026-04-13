import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { MetronomeProvider } from '@/components/MetronomeContext';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

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
import JoinBand           from './pages/JoinBand';

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

const BrandedLoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const ProtectedRoute = ({ children, requireBand = true }: { children: JSX.Element; requireBand?: boolean }) => {
  const { user, loading, profile } = useAuth();
  const { noBands, bandsLoading } = useBand();
  const location = useLocation();

  if (loading || bandsLoading) {
    return <BrandedLoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (profile && !profile.isActive) {
    if (location.pathname !== '/reactivate') return <Navigate to="/reactivate" replace />;
    return children;
  }

  if (!profile?.isProfileComplete) {
    if (location.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />;
    return children;
  }

  if (requireBand && noBands) {
    if (location.pathname !== '/bands/setup') return <Navigate to="/bands/setup" replace />;
    return children;
  }

  if (location.pathname === '/reactivate' && profile?.isActive) return <Navigate to="/" replace />;

  return <DataHydration>{children}</DataHydration>;
};

const PublicOnlyRoute = ({ children }: { children: JSX.Element }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <BrandedLoadingScreen />;
  if (user) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }
  return children;
};

const TwoFactorGuard = () => {
  const location = useLocation();
  const challengeId = sessionStorage.getItem('2fa_challenge_id');

  if (!challengeId) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <TwoFactorChallenge />;
};

const AppContent = () => {
  const navigate = useNavigate();

  useEffect(() => {
    CapacitorApp.addListener('appUrlOpen', async (event) => {
      try {
        const url = event.url;

        if (url.includes('auth/callback') || url.includes('google-auth')) {
          if (Capacitor.isNativePlatform()) {
            const urlObj = new URL(url.replace(/^com\.kirknetllc\.setlistpro:\/\//, 'https://placeholder/'));
            const path = urlObj.pathname + urlObj.search + urlObj.hash;
            navigate(path.startsWith('/') ? path : `/${path}`, { replace: true });
          } else {
            const urlObj = new URL(url);
            if (urlObj.pathname.startsWith('/auth/callback')) {
              window.location.href = url;
            }
          }
        }
      } catch (e) {
        console.error('[Auth] Failed to parse deep link URL:', e);
      }
    });
    return () => { CapacitorApp.removeAllListeners(); };
  }, [navigate]);

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
        <Route path="/2fa-challenge"    element={<TwoFactorGuard />} />
        <Route path="/pending"          element={<ProtectedRoute requireBand={false}><PendingApproval /></ProtectedRoute>} />
        <Route path="/reactivate"       element={<ProtectedRoute requireBand={false}><ReactivateAccount /></ProtectedRoute>} />
        <Route path="/bands/setup"      element={<ProtectedRoute requireBand={false}><BandSetup /></ProtectedRoute>} />
        <Route path="/bands/manage"     element={<ProtectedRoute><BandManage /></ProtectedRoute>} />
        <Route path="/bands/join"      element={<ProtectedRoute requireBand={false}><JoinBand /></ProtectedRoute>} />

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

  if (loading) return <BrandedLoadingScreen />;
  if (isUpdateRequired) return <SystemStatusScreen status={statusData} mode="update" />;
  if (isMaintenance)    return <SystemStatusScreen status={statusData} mode="maintenance" />;

  return (
    <BrowserRouter>
      {showSuggestion && <MobileAppSuggestion onDismiss={handleDismissSuggestion} />}
      <AppContent />
    </BrowserRouter>
  );
};

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
