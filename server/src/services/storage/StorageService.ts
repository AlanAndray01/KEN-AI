export type StorageProviderId = "local" | "s3" | "r2" | "cloudinary";

export interface PutObjectInput {
  key: string;
  buffer: Buffer;
  mimeType: string;
}

export interface StoredObject {
  key: string;
  size: number;
  mimeType: string;
}

export interface StorageService {
  readonly provider: StorageProviderId;
  put(input: PutObjectInput): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
