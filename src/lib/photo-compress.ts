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

async function decode(file: Blob): Promise<Decoded> {
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
