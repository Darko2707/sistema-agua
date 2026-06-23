export interface PdfStorage {
  upload(key: string, buffer: Buffer): Promise<string>;
  getUrl(key: string): Promise<string>;
  exists(key: string): Promise<boolean>;
}
