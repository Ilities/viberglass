const HEADER_BYTES = 8;

/**
 * A container without a TTY sends stdout and stderr interleaved in frames, each
 * an 8-byte header (stream id, padding, big-endian length) and its bytes.
 */
export function demuxDockerLogs(output: Buffer): string {
  if (output.length < HEADER_BYTES || output[0] > 2 || output[1] !== 0 || output[2] !== 0 || output[3] !== 0) {
    return output.toString("utf8");
  }
  const parts: Buffer[] = [];
  let offset = 0;
  while (offset + HEADER_BYTES <= output.length) {
    const size = output.readUInt32BE(offset + 4);
    parts.push(output.subarray(offset + HEADER_BYTES, offset + HEADER_BYTES + size));
    offset += HEADER_BYTES + size;
  }
  return Buffer.concat(parts).toString("utf8");
}
