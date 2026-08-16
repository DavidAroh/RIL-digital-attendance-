import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, Upload, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';

interface QRScannerProps {
  onScan: (data: string) => void;
}

export function QRScanner({ onScan }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasScanned = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  const startScanning = async () => {
    try {
      setError('');
      hasScanned.current = false;
      if (!window.isSecureContext) {
        setError(
          'Camera requires HTTPS or localhost. Use a secure connection or upload a photo of the QR code.'
        );
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError(
          'Camera not supported on this device. Upload a photo of the QR code instead.'
        );
        return;
      }

      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('qr-reader');
      }

      let cameraId: string | undefined;
      try {
        const cameras = await Html5Qrcode.getCameras();
        const preferred =
          cameras.find((c) => /back|rear|environment/i.test(c.label)) ||
          cameras[0];
        cameraId = preferred?.id;
      } catch {
        cameraId = undefined;
      }

      setIsScanning(true);

      if (cameraId) {
        await scannerRef.current.start(
          cameraId,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            if (!hasScanned.current) {
              hasScanned.current = true;
              onScan(decodedText);
              stopScanning();
            }
          },
          () => {}
        );
      } else {
        await scannerRef.current.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            if (!hasScanned.current) {
              hasScanned.current = true;
              onScan(decodedText);
              stopScanning();
            }
          },
          () => {}
        );
      }
    } catch (err) {
      console.error('Error starting scanner:', err);
      const msg = String((err as { message?: string })?.message || err);
      if (/NotAllowedError/i.test(msg)) {
        setError(
          'Camera permission denied. Allow camera access in browser settings or upload a photo of the QR code.'
        );
      } else if (/secure context|https/i.test(msg)) {
        setError(
          'Camera requires HTTPS or localhost. Use a secure connection or upload a photo of the QR code.'
        );
      } else {
        setError(
          'Failed to start camera. Upload a photo of the QR code instead.'
        );
      }
      setIsScanning(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setError('');
      hasScanned.current = false;
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('qr-reader');
      }
      const decodedText = await scannerRef.current.scanFile(file, true);
      if (!hasScanned.current) {
        hasScanned.current = true;
        onScan(decodedText);
        stopScanning();
      }
    } catch (err) {
      console.error('Error scanning file:', err);
      setError('Failed to read QR from image. Try a clearer photo.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  return (
    <div className="space-y-4">
      <div
        id="qr-reader"
        className={`rounded-xl overflow-hidden border ${
          isScanning ? 'block' : 'hidden'
        }`}
        style={{ minHeight: 280 }}
      ></div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!isScanning && (
        <div className="text-center py-10 border border-dashed rounded-xl bg-muted/20">
          <div className="mx-auto w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
            <Camera className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground mb-4 text-xs">
            Scan the office check-in kiosk or manager screen QR code
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <Button
              type="button"
              onClick={startScanning}
              className="gap-2"
            >
              <Camera className="w-4 h-4" />
              Open Camera
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
              id="qr-upload"
            />
            <label htmlFor="qr-upload">
              <Button
                type="button"
                variant="outline"
                className="gap-2 cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4" />
                Upload QR Image
              </Button>
            </label>
          </div>
        </div>
      )}

      {isScanning && (
        <Button
          type="button"
          variant="destructive"
          onClick={stopScanning}
          className="w-full gap-2"
        >
          <CameraOff className="w-4 h-4" />
          Stop Camera
        </Button>
      )}
    </div>
  );
}
