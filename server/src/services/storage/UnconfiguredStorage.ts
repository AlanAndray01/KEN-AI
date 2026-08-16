import { AppError } from "../../utils/AppError.js";
import type { StorageProviderId, StorageService, PutObjectInput, StoredObject } from "./StorageService.js";

export class UnconfiguredStorage implements StorageService {
  readonly provider: StorageProviderId;

  constructor(provider: Exclude<StorageProviderId, "local">) {
    this.provider = provider;
  }

  async put(_input: PutObjectInput): Promise<StoredObject> {
    throw this.error();
  }

  async get(_key: string): Promise<Buffer> {
    throw this.error();
  }

  async delete(_key: string): Promise<void> {
    throw this.error();
  }

  async exists(_key: string): Promise<boolean> {
    throw this.error();
  }

  private error(): AppError {
    return new AppError("Object storage is not configured.", {
      statusCode: 503,
      code: "STORAGE_NOT_CONFIGURED",
    });
  }
}
