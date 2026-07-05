/**
 * useCamera.ts — Real camera capture via getUserMedia + canvas
 * Replaces the simulated base64 placeholder in VisitsScreen
 */
import { useRef, useState, useCallback } from 'react';

export interface CapturedPhoto {
  dataUrl: string;      // base64 JPEG for local display & storage
  blob: Blob;           // for upload when online
  timestamp: string;
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);

  const openCamera = useCallback(async () => {
    setError(null);
    setIsCameraLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setIsOpen(true);
      // Attach to video element after state update
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      });
    } catch (err: any) {
      let msg = 'Tidak dapat mengakses kamera.';
      if (err.name === 'NotAllowedError') msg = 'Izin kamera ditolak. Aktifkan di pengaturan browser.';
      else if (err.name === 'NotFoundError') msg = 'Kamera tidak ditemukan di perangkat ini.';
      else if (err.name === 'NotReadableError') msg = 'Kamera sedang digunakan aplikasi lain.';
      setError(msg);
    } finally {
      setIsCameraLoading(false);
    }
  }, []);

  const capture = useCallback((): CapturedPhoto | null => {
    const video = videoRef.current;
    if (!video || !isOpen) return null;

    const maxDim = 800;
    let w = video.videoWidth || 1280;
    let h = video.videoHeight || 720;
    if (w > maxDim) {
      h = Math.round((h * maxDim) / w);
      w = maxDim;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Add timestamp watermark
    const now = new Date();
    const ts = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, canvas.height - 24, canvas.width, 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`FCOS · ${ts}`, 8, canvas.height - 8);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
    let blob: Blob;
    // Convert dataUrl to Blob
    const byteStr = atob(dataUrl.split(',')[1]);
    const ab = new ArrayBuffer(byteStr.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
    blob = new Blob([ab], { type: 'image/jpeg' });

    return { dataUrl, blob, timestamp: now.toISOString() };
  }, [isOpen]);

  const closeCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsOpen(false);
  }, []);

  return { videoRef, isOpen, isCameraLoading, error, openCamera, capture, closeCamera };
}
