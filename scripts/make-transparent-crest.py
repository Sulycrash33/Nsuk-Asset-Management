#!/usr/bin/env python3
"""
Turn the uploaded NSUK crest into a transparent-background PNG.

The crest arrived as an 8-bit palette PNG with a solid white background. A
naive "make every white pixel transparent" would also punch holes in the white
book and the white "KNOWLEDGE FOR DEVELOPMENT" ribbon, so this flood-fills
inward from the image border instead: only white that is reachable from the
outside is cleared.

Pure standard library — this container has no Pillow, ImageMagick or sharp.

    python3 scripts/make-transparent-crest.py public/download.png public/nsuk-crest.png
"""

from __future__ import annotations

import struct
import sys
import zlib
from collections import deque
from pathlib import Path

# A pixel counts as background if every channel is at least this bright.
WHITE_THRESHOLD = 228


def read_chunks(data: bytes):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit("Not a PNG file.")
    pos = 8
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        yield kind, body
        pos += 12 + length  # length + type + body + crc


def paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def unfilter(raw: bytes, width: int, height: int, bpp: int) -> bytearray:
    """Undo the per-scanline PNG filters, returning raw samples."""
    stride = width * bpp
    out = bytearray(stride * height)
    pos = 0
    for y in range(height):
        f = raw[pos]
        pos += 1
        line = raw[pos : pos + stride]
        pos += stride
        base = y * stride
        prior = base - stride

        for x in range(stride):
            value = line[x]
            left = out[base + x - bpp] if x >= bpp else 0
            up = out[prior + x] if y > 0 else 0
            up_left = out[prior + x - bpp] if (y > 0 and x >= bpp) else 0

            if f == 0:
                pass
            elif f == 1:
                value = (value + left) & 0xFF
            elif f == 2:
                value = (value + up) & 0xFF
            elif f == 3:
                value = (value + (left + up) // 2) & 0xFF
            elif f == 4:
                value = (value + paeth(left, up, up_left)) & 0xFF
            else:
                raise SystemExit(f"Unsupported PNG filter {f}")
            out[base + x] = value
    return out


def decode(path: Path):
    data = path.read_bytes()
    palette = b""
    idat = b""
    width = height = depth = colour = 0

    for kind, body in read_chunks(data):
        if kind == b"IHDR":
            width, height, depth, colour, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if depth != 8:
                raise SystemExit(f"Only 8-bit PNGs are supported (got {depth}-bit).")
            if interlace:
                raise SystemExit("Interlaced PNGs are not supported.")
        elif kind == b"PLTE":
            palette = body
        elif kind == b"IDAT":
            idat += body
        elif kind == b"IEND":
            break

    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(colour)
    if channels is None:
        raise SystemExit(f"Unsupported colour type {colour}.")

    samples = unfilter(zlib.decompress(idat), width, height, channels)

    # Normalise everything to flat RGB triples.
    rgb = bytearray(width * height * 3)
    for i in range(width * height):
        if colour == 3:
            idx = samples[i] * 3
            rgb[i * 3 : i * 3 + 3] = palette[idx : idx + 3]
        elif colour == 2:
            rgb[i * 3 : i * 3 + 3] = samples[i * 3 : i * 3 + 3]
        elif colour == 6:
            rgb[i * 3 : i * 3 + 3] = samples[i * 4 : i * 4 + 3]
        elif colour in (0, 4):
            g = samples[i * channels]
            rgb[i * 3 : i * 3 + 3] = bytes((g, g, g))
    return width, height, rgb


def background_mask(width: int, height: int, rgb: bytearray) -> bytearray:
    """Flood-fill white inward from the border so interior white is preserved."""
    mask = bytearray(width * height)
    queue: deque[int] = deque()

    def is_white(i: int) -> bool:
        o = i * 3
        return rgb[o] >= WHITE_THRESHOLD and rgb[o + 1] >= WHITE_THRESHOLD and rgb[o + 2] >= WHITE_THRESHOLD

    for x in range(width):
        for i in (x, (height - 1) * width + x):
            if not mask[i] and is_white(i):
                mask[i] = 1
                queue.append(i)
    for y in range(height):
        for i in (y * width, y * width + width - 1):
            if not mask[i] and is_white(i):
                mask[i] = 1
                queue.append(i)

    while queue:
        i = queue.popleft()
        x, y = i % width, i // width
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height:
                n = ny * width + nx
                if not mask[n] and is_white(n):
                    mask[n] = 1
                    queue.append(n)
    return mask


def encode_rgba(width: int, height: int, rgb: bytearray, mask: bytearray) -> bytes:
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter: None
        for x in range(width):
            i = y * width + x
            o = i * 3
            raw += rgb[o : o + 3]
            raw.append(0 if mask[i] else 255)

    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(
            ">I", zlib.crc32(kind + body) & 0xFFFFFFFF
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    source, target = Path(sys.argv[1]), Path(sys.argv[2])
    width, height, rgb = decode(source)
    mask = background_mask(width, height, rgb)
    target.write_bytes(encode_rgba(width, height, rgb, mask))

    cleared = sum(mask)
    total = width * height
    print(f"{source} -> {target}")
    print(f"  {width}x{height}, {cleared:,} of {total:,} pixels made transparent ({cleared / total:.0%})")


if __name__ == "__main__":
    main()
