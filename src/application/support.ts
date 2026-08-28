import { Buffer } from "node:buffer";
import type { z } from "zod";

import { ApplicationError, incompatibleSource, invalidInput } from "../contracts/errors.js";
import type { SlicePolicy } from "../policy/slice-policy.js";

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) {
    throw invalidInput();
  }
  return parsed.data;
}

export function parseSource<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw incompatibleSource();
  }
  return parsed.data;
}

export function assertUniqueIds(records: readonly { readonly id: string }[]): void {
  if (new Set(records.map(({ id }) => id)).size !== records.length) {
    throw incompatibleSource();
  }
}

export function assertResponseBounded(value: unknown, policy: SlicePolicy): void {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > policy.maxResponseBytes) {
    throw new ApplicationError("response_too_large", "The response cannot be returned safely.");
  }
}

export async function callWithDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<T> {
  if (externalSignal?.aborted === true) {
    throw new ApplicationError("request_cancelled", "The request was cancelled.");
  }

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let removeExternalListener: (() => void) | undefined;

  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new ApplicationError("dependency_unavailable", "The data source timed out.", true));
      controller.abort();
    }, timeoutMs);
  });

  const cancellation = new Promise<never>((_resolve, reject) => {
    if (externalSignal === undefined) {
      return;
    }
    const cancel = () => {
      reject(new ApplicationError("request_cancelled", "The request was cancelled."));
      controller.abort();
    };
    externalSignal.addEventListener("abort", cancel, { once: true });
    removeExternalListener = () => externalSignal.removeEventListener("abort", cancel);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      deadline,
      cancellation,
    ]);
  } catch (error) {
    if (error instanceof ApplicationError) {
      throw error;
    }
    throw new ApplicationError("dependency_unavailable", "The data source is unavailable.", true);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    removeExternalListener?.();
  }
}
