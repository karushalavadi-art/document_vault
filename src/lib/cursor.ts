import { badUserInput } from "./errors.js";

// Opaque cursor = base64("document:<id>"). Callers should treat cursors as
// opaque strings; we only decode them ourselves. Prisma pagination itself is
// driven by the document `id` (which is globally unique), so the cursor just
// needs to smuggle that id across requests without inviting clients to poke
// at raw ids directly.
const PREFIX = "document:";

export function encodeCursor(id: string): string {
  return Buffer.from(`${PREFIX}${id}`, "utf8").toString("base64");
}

export function decodeCursor(cursor: string): string {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, "base64").toString("utf8");
  } catch {
    throw badUserInput("cursor is not valid base64", "cursor");
  }
  if (!decoded.startsWith(PREFIX)) {
    throw badUserInput("cursor is malformed", "cursor");
  }
  return decoded.slice(PREFIX.length);
}
