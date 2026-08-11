export interface PdfStorage {
  upload(key: string, buffer: Buffer): Promise<string>;
  download(key: string, reference: string): Promise<Buffer | null>;
  isCurrentReference(key: string, reference: string): boolean;
  removeLegacyPublicCopy(key: string, reference: string): Promise<boolean>;
}
