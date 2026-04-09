import { useState, useEffect } from 'react';
import { Network } from '@capacitor/network';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let mounted = true;

    const initNetwork = async () => {
      const status = await Network.getStatus();
      if (mounted) setIsOnline(status.connected);

      Network.addListener('networkStatusChange', (s) => {
        if (mounted) setIsOnline(s.connected);
      });
    };

    initNetwork();

    return () => {
      mounted = false;
      Network.removeAllListeners();
    };
  }, []);

  return isOnline;
}
