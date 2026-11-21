// LUMARIS poster entry — validator and copier.
// Poster: sea-glass lighthouse over a turquoise lagoon at sunset,
// title LUMARIS across the top. This script checks the bundled
// poster meets the gate rules, then places it in the output folder.
//
// Local check: MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REQUIRED_EDGE = 1024;
const MAX_BYTES = 1024 * 1024; // 1 MiB
const PNG_MAGIC = '89504e470d0a1a0a';

const posterUrl = new URL('./entry.png', import.meta.url);
const posterBytes = readFileSync(posterUrl);

function assertWithinSizeLimit() {
  const { size } = statSync(posterUrl);
  if (size > MAX_BYTES) {
    throw new Error('entry.png is over 1 MiB');
  }
}

function readPngDimensions(bytes) {
  // IHDR width/height live at fixed offsets 16 and 20 in a PNG.
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function readJpegDimensions(bytes) {
  // Walk JPEG segments until a Start-Of-Frame segment gives us size.
  let pos = 2;
  while (pos + 9 < bytes.length) {
    if (bytes[pos] !== 0xff) {
      throw new Error('entry.png has a broken JPEG marker');
    }
    const code = bytes[pos + 1];
    const segmentLength = bytes.readUInt16BE(pos + 2);
    const isSof =
      code >= 0xc0 && code <= 0xcf && code !== 0xc4 && code !== 0xc8 && code !== 0xcc;
    if (isSof) {
      return {
        height: bytes.readUInt16BE(pos + 5),
        width: bytes.readUInt16BE(pos + 7),
      };
    }
    pos += 2 + segmentLength;
  }
  return { width: 0, height: 0 };
}

function validatePoster(bytes) {
  const looksPng = bytes.subarray(0, 8).toString('hex') === PNG_MAGIC;
  const looksJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

  if (!looksPng && !looksJpeg) {
    throw new Error('entry.png is neither a PNG nor a JPEG');
  }

  const dims = looksPng ? readPngDimensions(bytes) : readJpegDimensions(bytes);
  if (dims.width !== REQUIRED_EDGE || dims.height !== REQUIRED_EDGE) {
    throw new Error(
      `entry.png must be 1024x1024, got ${dims.width}x${dims.height}`,
    );
  }
}

// Validate first, copy second — never ship an unchecked file.
assertWithinSizeLimit();
validatePoster(posterBytes);

const destinationDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(destinationDir, { recursive: true });

const destinationPath = join(destinationDir, 'entry.png');
copyFileSync(posterUrl, destinationPath);

// Byte-for-byte check so the judged file is exactly the source poster.
const copiedBytes = readFileSync(destinationPath);
if (!copiedBytes.equals(posterBytes)) {
  throw new Error('copy mismatch');
}
