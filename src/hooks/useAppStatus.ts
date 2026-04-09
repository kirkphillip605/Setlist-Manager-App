import { useEffect, useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { AppStatus, AppPlatform } from '@/types/system';

interface StatusState {
  isMaintenance: boolean;
  isUpdateRequired: boolean;
  statusData: AppStatus | null;
  loading: boolean;
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://api.setlist.kirknet.io';

export const useAppStatus = () => {
  const [state, setState] = useState<StatusState>({
    isMaintenance: false,
    isUpdateRequired: false,
    statusData: null,
    loading: false,
  });

  const lastFetchTime = useRef<number>(0);
  const fetchTimeout  = useRef<NodeJS.Timeout | null>(null);

  const getPlatform = (): AppPlatform => {
    const p = Capacitor.getPlatform();
    if (p === 'ios')     return 'ios';
    if (p === 'android') return 'android';
    return 'web';
  };

  const checkVersion = async (status: AppStatus): Promise<boolean> => {
    if (!status.requires_update) return false;
    if (getPlatform() === 'web') return false;
    try {
      const info = await App.getInfo();
      const build = parseInt(info.build) || 0;
      return !!(status.min_version_code && build < status.min_version_code);
    } catch {
      return false;
    }
  };

  const fetchStatus = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchTime.current < 10_000) return;
    lastFetchTime.current = now;

    try {
      const env      = import.meta.env.PROD ? 'production' : 'development';
      const platform = getPlatform();
      const resp = await fetch(
        `${API_BASE}/api/status?env=${env}&platform=${platform}`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (!resp.ok) {
        setState(prev => ({ ...prev, loading: false }));
        return;
      }

      const data: AppStatus[] = await resp.json();
      if (!data || data.length === 0) {
        setState({ isMaintenance: false, isUpdateRequired: false, statusData: null, loading: false });
        return;
      }

      const specific  = data.find(d => d.platform === platform);
      const generic   = data.find(d => d.platform === 'any');
      const effective = (specific || generic) as AppStatus;

      const updateNeeded = await checkVersion(effective);
      setState({ isMaintenance: effective.is_maintenance, isUpdateRequired: updateNeeded, statusData: effective, loading: false });
    } catch {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    const handleFocus = () => { if (document.visibilityState === 'visible') fetchStatus(); };
    window.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
      if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
    };
  }, [fetchStatus]);

  return state;
};
