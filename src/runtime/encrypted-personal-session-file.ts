import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { isDeepStrictEqual } from "node:util";

const AAD = Buffer.from("promethee-mcp-personal-session-v1", "utf8");
const MAX_FILE_BYTES = 32 * 1024;
const LOCK_WAIT_MS = 1_000;
const STALE_LOCK_MS = 5_000;
const LOCK_RETRY_MS = 10;
const LOCK_SLEEP = new Int32Array(new SharedArrayBuffer(4));
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;

type Envelope = Readonly<{
  v: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}>;

export interface PersonalSessionPersistence {
  load(): unknown | null;
  save(value: unknown): void;
  clear(): void;
  compareAndSwap(expected: unknown | null, value: unknown): boolean;
}

export interface EncryptedFilePersonalSessionPersistenceOptions {
  readonly file: string;
  readonly key: Uint8Array;
}

function decode(value: string, bytes: number): Buffer {
  if (!BASE64URL_PATTERN.test(value)) throw new Error("invalid_session_file");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength !== bytes || decoded.toString("base64url") !== value) {
    throw new Error("invalid_session_file");
  }
  return decoded;
}

function decodeBounded(value: string, minimumBytes: number, maximumBytes: number): Buffer {
  if (!BASE64URL_PATTERN.test(value)) throw new Error("invalid_session_file");
  const decoded = Buffer.from(value, "base64url");
  if (
    decoded.byteLength < minimumBytes ||
    decoded.byteLength > maximumBytes ||
    decoded.toString("base64url") !== value
  ) {
    throw new Error("invalid_session_file");
  }
  return decoded;
}

function parseEnvelope(value: unknown): Envelope {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Reflect.get(value, "v") !== 1 ||
    typeof Reflect.get(value, "iv") !== "string" ||
    typeof Reflect.get(value, "tag") !== "string" ||
    typeof Reflect.get(value, "ciphertext") !== "string" ||
    Object.keys(value).sort().join(",") !== "ciphertext,iv,tag,v"
  ) {
    throw new Error("invalid_session_file");
  }
  return value as Envelope;
}

export class EncryptedFilePersonalSessionPersistence implements PersonalSessionPersistence {
  readonly #file: string;
  readonly #lockFile: string;
  readonly #key: Buffer;

  public constructor(options: EncryptedFilePersonalSessionPersistenceOptions) {
    if (!isAbsolute(options.file) || options.file.length > 4_096 || options.file.includes("\0")) {
      throw new TypeError("Personal session file must be an absolute path");
    }
    if (options.key.byteLength !== 32) {
      throw new TypeError("Personal session encryption key must contain exactly 32 bytes");
    }
    this.#file = options.file;
    this.#lockFile = `${options.file}.lock`;
    this.#key = Buffer.from(options.key);
  }

  #loadUnlocked(): unknown | null {
    let stat;
    try {
      stat = lstatSync(this.#file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX_FILE_BYTES) {
      throw new Error("invalid_session_file");
    }
    const envelope = parseEnvelope(JSON.parse(readFileSync(this.#file, "utf8")) as unknown);
    const iv = decode(envelope.iv, 12);
    const tag = decode(envelope.tag, 16);
    const ciphertext = decodeBounded(envelope.ciphertext, 1, MAX_FILE_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", this.#key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (plaintext.byteLength > MAX_FILE_BYTES) throw new Error("invalid_session_file");
    return JSON.parse(plaintext.toString("utf8")) as unknown;
  }

  #saveUnlocked(value: unknown): void {
    const plaintext = Buffer.from(JSON.stringify(value), "utf8");
    if (plaintext.byteLength < 1 || plaintext.byteLength > MAX_FILE_BYTES) {
      throw new Error("invalid_session_payload");
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope: Envelope = {
      v: 1,
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
    };
    const serialized = `${JSON.stringify(envelope)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > MAX_FILE_BYTES) {
      throw new Error("invalid_session_payload");
    }

    const temporary = `${this.#file}.${process.pid.toString(10)}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      writeFileSync(temporary, serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
      renameSync(temporary, this.#file);
      chmodSync(this.#file, 0o600);
    } finally {
      rmSync(temporary, { force: true });
    }
  }

  #withLock<T>(operation: () => T): T {
    mkdirSync(dirname(this.#file), { recursive: true, mode: 0o700 });
    const deadline = Date.now() + LOCK_WAIT_MS;
    const lockIdentity = `${process.pid.toString(10)}-${randomBytes(16).toString("hex")}`;
    let descriptor: number | undefined;
    while (descriptor === undefined) {
      try {
        descriptor = openSync(this.#lockFile, "wx", 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() >= deadline) throw new Error("session_persistence_busy");
        Atomics.wait(LOCK_SLEEP, 0, 0, 10);
      }
    }
    try {
      writeFileSync(descriptor, lockIdentity, { encoding: "utf8" });
      return operation();
    } finally {
      closeSync(descriptor);
      try {
        if (readFileSync(this.#lockFile, "utf8") === lockIdentity) {
          rmSync(this.#lockFile, { force: true });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }

  public load(): unknown | null {
    return this.#loadUnlocked();
  }

  public save(value: unknown): void {
    this.#withLock(() => this.#saveUnlocked(value));
  }

  public clear(): void {
    this.#withLock(() => rmSync(this.#file, { force: true }));
  }

  public compareAndSwap(expected: unknown | null, value: unknown): boolean {
    return this.#withLock(() => {
      const current = this.#loadUnlocked();
      if (!isDeepStrictEqual(current, expected)) return false;
      this.#saveUnlocked(value);
      return true;
    });
  }
}
