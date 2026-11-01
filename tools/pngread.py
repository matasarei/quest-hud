"""A small PNG reader for the art import: standard library only, refusing anything odd.

Reads non-interlaced PNGs of colour type 2 (RGB), 3 (palette, 1/2/4/8 bits, tRNS) or
6 (RGBA), 8 bits a channel, up to 1024 x 1024. Returns rows of (r, g, b, a) tuples.
"""
import struct
import zlib

MAX_SIDE = 1024
MAX_INFLATED = 8 * 1024 * 1024


class PngError(ValueError):
    pass


def read_png(path):
    with open(path, "rb") as handle:
        data = handle.read(4 * 1024 * 1024)
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise PngError(f"{path}: not a PNG")

    pos, header, palette, alpha, idat = 8, None, None, None, []
    while pos + 8 <= len(data):
        length, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        if len(body) != length:
            raise PngError(f"{path}: truncated chunk")
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", body)
        elif kind == b"PLTE":
            palette = [tuple(body[i:i + 3]) for i in range(0, len(body), 3)]
        elif kind == b"tRNS":
            alpha = list(body)
        elif kind == b"IDAT":
            idat.append(body)
        elif kind == b"IEND":
            break
        pos += 12 + length

    if header is None:
        raise PngError(f"{path}: no IHDR")
    width, height, depth, colour, _, _, interlace = header
    if not (0 < width <= MAX_SIDE and 0 < height <= MAX_SIDE):
        raise PngError(f"{path}: {width}x{height} is out of bounds")
    if interlace != 0:
        raise PngError(f"{path}: interlaced PNGs are not read")
    channels = {2: 3, 3: 1, 6: 4}.get(colour)
    if channels is None or (colour != 3 and depth != 8) or (colour == 3 and depth not in (1, 2, 4, 8)):
        raise PngError(f"{path}: colour type {colour} at {depth} bits is not read")
    if colour == 3 and palette is None:
        raise PngError(f"{path}: palette image without PLTE")

    inflater = zlib.decompressobj()
    raw = inflater.decompress(b"".join(idat), MAX_INFLATED)
    if inflater.unconsumed_tail:
        raise PngError(f"{path}: inflates past {MAX_INFLATED} bytes")

    bits_per_pixel = depth * channels
    stride = (width * bits_per_pixel + 7) // 8
    step = max(1, bits_per_pixel // 8)
    rows, previous, pos = [], bytearray(stride), 0
    for _ in range(height):
        kind, line = raw[pos], bytearray(raw[pos + 1:pos + 1 + stride])
        pos += 1 + stride
        if len(line) != stride:
            raise PngError(f"{path}: image data too short")
        for i in range(stride):
            left = line[i - step] if i >= step else 0
            up = previous[i]
            corner = previous[i - step] if i >= step else 0
            if kind == 1:
                line[i] = (line[i] + left) & 0xFF
            elif kind == 2:
                line[i] = (line[i] + up) & 0xFF
            elif kind == 3:
                line[i] = (line[i] + ((left + up) >> 1)) & 0xFF
            elif kind == 4:
                guess = left + up - corner
                pa, pb, pc = abs(guess - left), abs(guess - up), abs(guess - corner)
                line[i] = (line[i] + (left if pa <= pb and pa <= pc else up if pb <= pc else corner)) & 0xFF
            elif kind != 0:
                raise PngError(f"{path}: unknown filter {kind}")
        previous = line
        rows.append(_pixels(line, width, depth, colour, palette, alpha))
    return width, height, rows


def _pixels(line, width, depth, colour, palette, alpha):
    if colour == 2:
        return [(line[3 * x], line[3 * x + 1], line[3 * x + 2], 255) for x in range(width)]
    if colour == 6:
        return [tuple(line[4 * x:4 * x + 4]) for x in range(width)]
    out, per_byte, mask = [], 8 // depth, (1 << depth) - 1
    for x in range(width):
        byte = line[x // per_byte]
        index = (byte >> (8 - depth * (x % per_byte + 1))) & mask
        r, g, b = palette[index] if index < len(palette) else (0, 0, 0)
        a = alpha[index] if alpha is not None and index < len(alpha) else 255
        out.append((r, g, b, a))
    return out
