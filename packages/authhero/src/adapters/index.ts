// Export cache adapters
export * from "./cache";

// At-rest encryption wrapper for sensitive credential fields
export {
  createEncryptedDataAdapter,
  createEncryptedDataAdapterWithKeyRing,
} from "./createEncryptedDataAdapter";
export type { EncryptKeyIdResolver } from "./createEncryptedDataAdapter";
export {
  loadEncryptionKey,
  encryptField,
  decryptField,
  encryptFieldWithRing,
  decryptFieldWithRing,
  parseKeyId,
  isEncrypted,
} from "../utils/field-encryption";
export type { KeyRing } from "../utils/field-encryption";
