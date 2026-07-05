import { useState, useEffect } from 'react';
import { logger } from '../../core/logger';

/**
 * Custom Hook: useConnectivity
 * Real-time monitoring of browser's network status.
 */
export function useConnectivity() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      logger.info('Network', 'Device status: ONLINE. Synchronizer can run');
      setIsOnline(true);
    };

    const handleOffline = () => {
      logger.warn('Network', 'Device status: OFFLINE. Operations will proceed local-first');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export default useConnectivity;
