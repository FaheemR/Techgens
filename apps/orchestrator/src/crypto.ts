import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** AES-256-GCM envelope for secrets at rest: base64(iv).base64(tag).base64(ciphertext). */
export class SecretBox {
  private readonly key: Buffer;

  constructor(secret: string) {
    // Accept hex/base64/any passphrase; normalise to 32 bytes.
    const raw = /^[0-9a-f]{64}$/i.test(secret) ? Buffer.from(secret, "hex") : createHash("sha256").update(secret).digest();
    this.key = raw;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
  }

  decrypt(envelope: string): string {
    const [iv, tag, data] = envelope.split(".").map((p) => Buffer.from(p, "base64"));
    if (!iv || !tag || !data) throw new Error("malformed secret envelope");
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }
}
