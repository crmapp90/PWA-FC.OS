/**
 * CameraCapture.tsx — Production camera component for field use
 * Replaces simulated image injection in VisitsScreen
 */
import React, { useEffect } from 'react';
import { Camera, X, ZapOff, Loader2 } from 'lucide-react';
import { useCamera, CapturedPhoto } from '../hooks/useCamera';

interface Props {
  onCapture: (photo: CapturedPhoto) => void;
  onClose: () => void;
}

export const CameraCapture: React.FC<Props> = ({ onCapture, onClose }) => {
  const { videoRef, isOpen, isCameraLoading, error, openCamera, capture, closeCamera } = useCamera();

  useEffect(() => {
    openCamera();
    return () => closeCamera();
  }, []);

  const handleCapture = () => {
    const photo = capture();
    if (photo) {
      onCapture(photo);
      closeCamera();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Close button */}
      <div className="absolute top-4 left-4 z-10">
        <button
          onClick={() => { closeCamera(); onClose(); }}
          className="bg-black/60 text-white rounded-full p-2"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Viewfinder */}
      <div className="flex-1 relative overflow-hidden">
        {isCameraLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
            <Loader2 className="w-10 h-10 animate-spin mb-3" />
            <span className="text-sm">Membuka kamera...</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white px-8 text-center">
            <ZapOff className="w-12 h-12 mb-4 text-red-400" />
            <p className="font-bold text-lg mb-2">Kamera Tidak Tersedia</p>
            <p className="text-sm text-gray-300">{error}</p>
            <button
              onClick={() => { closeCamera(); onClose(); }}
              className="mt-6 bg-white text-black font-bold px-6 py-3 rounded-full"
            >
              Kembali
            </button>
          </div>
        )}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${!isOpen ? 'opacity-0' : ''}`}
        />
        {/* Frame guide */}
        {isOpen && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-8 border-2 border-white/40 rounded-xl" />
            <div className="absolute top-8 left-8 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl-lg" />
            <div className="absolute top-8 right-8 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr-lg" />
            <div className="absolute bottom-8 left-8 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl-lg" />
            <div className="absolute bottom-8 right-8 w-6 h-6 border-b-2 border-r-2 border-white rounded-br-lg" />
          </div>
        )}
      </div>

      {/* Shutter */}
      {isOpen && (
        <div className="flex justify-center items-center py-8 bg-black">
          <button
            onClick={handleCapture}
            className="w-20 h-20 rounded-full border-4 border-white bg-white/20 flex items-center justify-center active:scale-90 transition-transform"
          >
            <div className="w-14 h-14 rounded-full bg-white" />
          </button>
        </div>
      )}
    </div>
  );
};
