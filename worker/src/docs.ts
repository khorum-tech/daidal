import { isColor } from "../../app/src/lib/diagram/model";
import { HttpError, isPlainObject } from "./http";

/**
 * A diagram document is the JSON form of the .skope.json export, version 1. The server keeps it as given: it
 * checks only that it is an object with `version: 1` and that it fits, and leaves diffing to the browser.
 */
export const MAX_DOC_BYTES = 1024 * 1024;
export const MAX_NAME = 100;
export const MAX_DECIDED_BYTES = 64 * 1024;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const encoder = new TextEncoder();

/** [value] as stored document text. Throws a 400 naming [what] when it is not a version 1 document or too large. */
export function docText(value: unknown, what = "doc"): string {
  if (!isPlainObject(value)) throw new HttpError(400, `${what} must be a JSON object`);
  if (value.version !== 1) throw new HttpError(400, `${what} must be a version 1 Daidal document`);
  if (isPlainObject(value.tags)) {
    for (const [key, tag] of Object.entries(value.tags)) {
      if (isPlainObject(tag) && tag.color !== undefined && !isColor(tag.color)) {
        throw new HttpError(400, `${what}: tag “${key}” has a colour Daidal can't use; give it as #rrggbb`);
      }
    }
  }
  const text = JSON.stringify(value);
  if (encoder.encode(text).length > MAX_DOC_BYTES) throw new HttpError(400, `${what} must be 1 MB or less`);
  return text;
}

/** A trimmed name of 1–100 characters. */
export function nameOf(value: unknown, what = "name"): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new HttpError(400, `${what} is required`);
  if (name.length > MAX_NAME) throw new HttpError(400, `${what} must be ${MAX_NAME} characters or fewer`);
  return name;
}

/** The name a document gives itself (`diagram.name`), if any. */
export function docName(doc: unknown): unknown {
  return isPlainObject(doc) && isPlainObject(doc.diagram) ? doc.diagram.name : undefined;
}

/** Per-change accept/skip verdicts on a follower, kept as JSON text. */
export function decidedText(value: unknown): string {
  if (!isPlainObject(value)) throw new HttpError(400, "decided must be a JSON object");
  const text = JSON.stringify(value);
  if (encoder.encode(text).length > MAX_DECIDED_BYTES) throw new HttpError(400, "decided is too large");
  return text;
}

export function emailOf(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) throw new HttpError(400, "email must be an email address");
  return email;
}
