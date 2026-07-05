import { useState, useCallback } from 'react';
import { logger } from '../../core/logger';

export type PermissionStatus = 'prompt' | 'granted' | 'denied' | 'unsupported';

/**
 * Custom Hook: usePermission
 * Manages device permissions for Geolocation and Camera, complete with logging.
 */
export function usePermission() {
  const [locationStatus, setLocationStatus] = useState<PermissionStatus>('prompt');
  const [cameraStatus, setCameraStatus] = useState<PermissionStatus>('prompt');

  const checkLocationPermission = useCallback(async () => {
    if (!navigator.permissions || !navigator.geolocation) {
      setLocationStatus('unsupported');
      return 'unsupported';
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      setLocationStatus(result.state as PermissionStatus);
      logger.debug('Permissions', `Location status query: ${result.state}`);
      return result.state as PermissionStatus;
    } catch (error) {
      logger.error('Permissions', 'Failed to query location permission status', error);
      return 'prompt';
    }
  }, []);

  const requestLocation = useCallback((): Promise<{ latitude: number; longitude: number; accuracy: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        logger.warn('Permissions', 'Geolocation is not supported by this device');
        reject(new Error('Geolocation unsupported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          logger.info('Permissions', 'Location acquired successfully', {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
          setLocationStatus('granted');
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (error) => {
          logger.error('Permissions', 'Location acquisition failed', error);
          if (error.code === error.PERMISSION_DENIED) {
            setLocationStatus('denied');
          }
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }, []);

  const requestCamera = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraStatus('unsupported');
      logger.warn('Permissions', 'Camera access is not supported by this browser/device');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Clean up the stream immediately since we only queried permission
      stream.getTracks().forEach(track => track.stop());
      setCameraStatus('granted');
      logger.info('Permissions', 'Camera permission granted');
      return true;
    } catch (error) {
      logger.error('Permissions', 'Camera permission denied or failed', error);
      setCameraStatus('denied');
      return false;
    }
  }, []);

  return {
    locationStatus,
    cameraStatus,
    checkLocationPermission,
    requestLocation,
    requestCamera,
  };
}

export default usePermission;
