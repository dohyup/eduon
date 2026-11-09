export interface StoragePort {
  readonly downloadHosts: readonly string[];
  upload(input: { key: string; data: Uint8Array; mime: string }): Promise<void>;
  signDownload(input: { key: string; expiresIn: 60 }): Promise<string>;
  delete(key: string): Promise<void>;
}
/** Trusted server integration only: a client can never supply a scan result. */
export interface FileScanner {
  scan(input: {
    data: Uint8Array;
    mime: string;
    sha256: string;
  }): Promise<"clean" | "rejected" | "unavailable">;
}
