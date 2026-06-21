/// <reference types="vite/client" />

interface DetectedBarcode {
  rawValue: string;
  format: string;
  boundingBox: DOMRectReadOnly;
  cornerPoints: { x: number; y: number }[];
}

interface BarcodeDetectorOptions {
  formats: string[];
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  detect(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap): Promise<DetectedBarcode[]>;
  static getSupportedFormats(): Promise<string[]>;
}
