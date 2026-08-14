import { safeStorage } from "electron";

import {
  PortableEncryptedKeystore,
} from "./keystore-core.js";

export type { SecretName, SecureStoragePort } from "./keystore-core.js";
export { assertSecureStorageBackend } from "./keystore-core.js";

export class LocalEncryptedKeystore extends PortableEncryptedKeystore {
  constructor(path: string) {
    super(path, safeStorage);
  }
}
