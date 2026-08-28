import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

import { ApplicationError, invalidCursor } from "../contracts/errors.js";
import type { SlicePolicy } from "../policy/slice-policy.js";
import type { Clock } from "../ports/clock.js";

export interface CursorContext {
  readonly subject: string;
  readonly clientId: string;
  readonly issuer: string;
  readonly resource: string;
  readonly scope: string;
  readonly tool: "promethee_list_projects" | "promethee_list_tasks";
  readonly filter: string;
  readonly orderingVersion: string;
}

export interface CursorState {
  readonly pageToken: string;
  readonly limit: number;
}

export interface CursorCodec {
  seal(state: CursorState, context: CursorContext): string;
  open(cursor: string, context: CursorContext): CursorState;
}

const cursorPayloadSchema = z
  .object({
    version: z.literal(1),
    pageToken: z.string().min(1),
    limit: z.number().int().min(1),
    expiresAt: z.number().int().positive(),
  })
  .strict();

function contextAad(context: CursorContext): Buffer {
  return Buffer.from(
    JSON.stringify([
      context.subject,
      context.clientId,
      context.issuer,
      context.resource,
      context.scope,
      context.tool,
      context.filter,
      context.orderingVersion,
    ]),
    "utf8",
  );
}

export class AesGcmCursorCodec implements CursorCodec {
  readonly #key: Buffer;
  readonly #clock: Clock;
  readonly #policy: SlicePolicy;

  constructor(key: Uint8Array, clock: Clock, policy: SlicePolicy) {
    if (key.byteLength !== 32) {
      throw new Error("Cursor key must contain exactly 32 bytes.");
    }

    this.#key = Buffer.from(key);
    this.#clock = clock;
    this.#policy = policy;
  }

  seal(state: CursorState, context: CursorContext): string {
    if (
      state.limit < 1 ||
      state.limit > this.#policy.maxPageSize ||
      Buffer.byteLength(state.pageToken, "utf8") > this.#policy.maxBackendPageTokenBytes
    ) {
      throw new ApplicationError("incompatible_source", "The source pagination state is invalid.");
    }

    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, nonce, { authTagLength: 16 });
    cipher.setAAD(contextAad(context));

    const plaintext = Buffer.from(
      JSON.stringify({
        version: 1,
        pageToken: state.pageToken,
        limit: state.limit,
        expiresAt: this.#clock.now().getTime() + this.#policy.cursorTtlMs,
      }),
      "utf8",
    );
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const token = [
      "v1",
      nonce.toString("base64url"),
      ciphertext.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
    ].join(".");

    if (Buffer.byteLength(token, "utf8") > this.#policy.maxCursorBytes) {
      throw new ApplicationError("response_too_large", "The response cannot be returned safely.");
    }

    return token;
  }

  open(cursor: string, context: CursorContext): CursorState {
    try {
      if (Buffer.byteLength(cursor, "utf8") > this.#policy.maxCursorBytes) {
        throw invalidCursor();
      }

      const parts = cursor.split(".");
      if (parts.length !== 4 || parts[0] !== "v1") {
        throw invalidCursor();
      }

      const nonceSegment = parts[1] ?? "";
      const ciphertextSegment = parts[2] ?? "";
      const tagSegment = parts[3] ?? "";
      const nonce = Buffer.from(nonceSegment, "base64url");
      const ciphertext = Buffer.from(ciphertextSegment, "base64url");
      const tag = Buffer.from(tagSegment, "base64url");
      if (
        nonce.byteLength !== 12 ||
        ciphertext.byteLength === 0 ||
        tag.byteLength !== 16 ||
        nonce.toString("base64url") !== nonceSegment ||
        ciphertext.toString("base64url") !== ciphertextSegment ||
        tag.toString("base64url") !== tagSegment
      ) {
        throw invalidCursor();
      }

      const decipher = createDecipheriv("aes-256-gcm", this.#key, nonce, { authTagLength: 16 });
      decipher.setAAD(contextAad(context));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      const payload = cursorPayloadSchema.parse(JSON.parse(plaintext.toString("utf8")));

      if (
        payload.expiresAt <= this.#clock.now().getTime() ||
        payload.limit > this.#policy.maxPageSize ||
        Buffer.byteLength(payload.pageToken, "utf8") > this.#policy.maxBackendPageTokenBytes
      ) {
        throw invalidCursor();
      }

      return Object.freeze({ pageToken: payload.pageToken, limit: payload.limit });
    } catch {
      throw invalidCursor();
    }
  }
}
