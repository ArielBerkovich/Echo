import { pipeline } from "node:stream";
import type { Readable, Writable } from "node:stream";

/** Stream a stored object while propagating disconnects and source errors. */
export function streamDownload(
  source: Readable,
  response: Writable,
  onError: (error: Error) => void
): void {
  pipeline(source, response, (error) => {
    if (error) onError(error);
  });
}
