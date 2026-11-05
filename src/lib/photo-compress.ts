/**
 * Asset photos are reduced in the browser before upload, so a 4–10 MB camera
 * picture does not cross a phone connection or fill the bucket. The aim is
 * about 300 KB: enough to identify an item, small enough to send on a weak
 * signal. Re-encoding also drops camera metadata such as GPS position.
 */
export const PHOTO_TARGET_BYTES = 300 * 1024;
/** Longest side, in pixels, of a stored photo. */
export const PHOTO_MAX_EDGE = 1600;
/** Longest side of the list thumbnail: a 56 px tile on a 3x phone screen. */
export const THUMBNAIL_MAX_EDGE = 192;
const THUMBNAIL_QUALITY = 0.7;
/** Never shrink below this on the way to the target; detail matters more. */
const PHOTO_MIN_EDGE = 640;
const START_QUALITY = 0.82;
const MIN_QUALITY = 0.5;

/** Dimensions scaled to fit within `maxEdge`, never enlarged. */
export function fitWithin(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

/** How much of a file to read for its JPEG header. EXIF and the frame header sit at the start. */
const HEADER_BYTES = 256 * 1024;

/**
 * A JPEG's stored width and height and its EXIF orientation, read from the
 * header without decoding the picture. Null when the file is not a JPEG or the
 * header is not where it is expected; the caller then decodes it whole.
 */
export function jpegInfo(bytes: Uint8Array): { width: number; height: number; orientation: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let orientation = 1;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) { at += 1; continue; } // fill byte
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { at += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null; // image data before a frame header
    const length = view.getUint16(at + 2);
    if (length < 2) return null;
    const body = at + 4;
    // APP1 "Exif\0\0": a TIFF header, then IFD0, whose tag 0x0112 is orientation.
    if (marker === 0xe1 && body + 14 <= bytes.length &&
        view.getUint32(body) === 0x45786966 && view.getUint16(body + 4) === 0) {
      const tiff = body + 6;
      const little = view.getUint16(tiff) === 0x4949;
      const u16 = (o: number) => view.getUint16(o, little);
      const u32 = (o: number) => view.getUint32(o, little);
      const ifd = tiff + u32(tiff + 4);
      if (ifd + 2 <= bytes.length) {
        const count = u16(ifd);
        for (let i = 0; i < count; i++) {
          const entry = ifd + 2 + i * 12;
          if (entry + 12 > bytes.length) break;
          if (u16(entry) === 0x0112) {
            const value = u16(entry + 8);
            if (value >= 1 && value <= 8) orientation = value;
            break;
          }
        }
      }
    }
    // A frame header (SOF0–SOF15, not DHT, JPG or DAC) carries the size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (body + 5 > bytes.length) return null;
      const height = view.getUint16(body + 1);
      const width = view.getUint16(body + 3);
      return width > 0 && height > 0 ? { width, height, orientation } : null;
    }
    at = body + length - 2;
  }
  return null;
}

/**
 * Decodes a large camera JPEG straight to the size that is kept, so the phone
 * never holds the full picture in memory: a 12-megapixel photo is about 48 MB
 * decoded, the kept 1600 px version about 8 MB. On low-memory phones the full
 * decode could make the browser reload the page. Null when the browser cannot
 * do it, or does it differently than asked; the caller then decodes it whole.
 */
async function decodeReduced(file: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap !== "function") return null;
  let info: ReturnType<typeof jpegInfo>;
  try {
    info = jpegInfo(new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer()));
  } catch {
    return null;
  }
  if (!info || Math.max(info.width, info.height) <= PHOTO_MAX_EDGE) return null;
  // Orientations 5–8 turn the picture on its side.
  const sideways = info.orientation >= 5;
  const upright = sideways ? { width: info.height, height: info.width } : info;
  const target = fitWithin(upright.width, upright.height, PHOTO_MAX_EDGE);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
      resizeWidth: target.width,
      resizeHeight: target.height,
      resizeQuality: "high",
    });
  } catch {
    return null;
  }
  // A browser that resizes before turning the picture would hand back the
  // sides swapped, and the photo squashed. Use the whole decode instead.
  if (bitmap.width !== target.width || bitmap.height !== target.height) {
    bitmap.close();
    return null;
  }
  return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
}

async function decode(file: Blob): Promise<Decoded> {
  const reduced = await decodeReduced(file);
  if (reduced) return reduced;
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      /* Fall through to an <img>, which some browsers decode more formats with. */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function encode(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("This browser cannot prepare photos."));
  // JPEG has no transparency; a transparent PNG would otherwise turn black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The photo could not be prepared."))),
      "image/jpeg",
      quality,
    ),
  );
}

/** Storage key of a photo's list thumbnail, kept beside the photo. */
export function thumbnailKey(photoKey: string): string {
  return `${photoKey}.thumb.jpg`;
}

/**
 * Returns a JPEG of about PHOTO_TARGET_BYTES or less. Quality is lowered
 * first, then the picture is made smaller, so a photo keeps as much size as
 * the target allows.
 */
export async function compressPhoto(file: File): Promise<File> {
  return (await preparePhoto(file)).photo;
}

/** The reduced photo and its small list thumbnail, from one decode. */
export async function preparePhoto(file: File): Promise<{ photo: File; thumbnail: File }> {
  let decoded: Decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error(
      "This photo's format could not be read on this device. Take the photo again with the camera, or choose a JPEG or PNG.",
    );
  }
  try {
    const photo = await reduce(decoded);
    const edge = fitWithin(decoded.width, decoded.height, THUMBNAIL_MAX_EDGE);
    const thumbnail = await encode(decoded.source, edge.width, edge.height, THUMBNAIL_QUALITY);
    return { photo, thumbnail: new File([thumbnail], "thumbnail.jpg", { type: "image/jpeg" }) };
  } finally {
    decoded.release();
  }
}

async function reduce(decoded: Decoded): Promise<File> {
  let { width, height } = fitWithin(decoded.width, decoded.height, PHOTO_MAX_EDGE);
  let best: Blob | null = null;
  for (;;) {
    for (let quality = START_QUALITY; quality >= MIN_QUALITY - 1e-9; quality -= 0.08) {
      const blob = await encode(decoded.source, width, height, quality);
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= PHOTO_TARGET_BYTES) {
        return new File([blob], "photo.jpg", { type: "image/jpeg" });
      }
    }
    if (Math.max(width, height) <= PHOTO_MIN_EDGE) break;
    ({ width, height } = fitWithin(width, height, Math.max(PHOTO_MIN_EDGE, Math.round(Math.max(width, height) * 0.8))));
  }
  // Only an unusually busy picture gets here; the smallest attempt is
  // still a fraction of the original.
  return new File([best!], "photo.jpg", { type: "image/jpeg" });
}
