"""EMONEY bitmap commands confirmed at MONEY.EXE file offset 0x2e07e."""
import struct
import zlib
from pathlib import Path
from unpack_toco import chunk


def bitmap(data, width, height, offset=0):
    if not 0 < width <= 4096 or not 0 < height <= 4096:
        raise ValueError('Invalid bitmap dimensions')
    pixels = bytearray(width * height)
    alpha = bytearray(width * height)
    x = y = 0
    while y < height:
        op = data[offset]
        offset += 1
        if op == 255:
            if x != width:
                raise ValueError(f'Incomplete scanline {y}: {x}/{width}')
            y += 1
            x = 0
            continue
        if op > 6:
            raise ValueError(f'Unknown bitmap opcode {op}')
        count = data[offset]
        offset += 1
        if op == 0:
            x += count
            if x > width:
                raise ValueError('Skip exceeds scanline')
            continue
        if op == 1:
            raw = data[offset:offset+1] * count
            offset += 1
        else:
            count = count if op == 2 else 4 * count + op - 3
            raw = data[offset:offset+count]
            offset += count
        if len(raw) != count or x + count > width:
            raise ValueError('Bitmap payload exceeds bounds')
        start = y * width + x
        pixels[start:start+count] = raw
        alpha[start:start+count] = b'\xff' * count
        x += count
    return pixels, alpha, offset


def cmp(data, palette):
    width, height = struct.unpack_from('<HH', data)
    pixels, alpha, end = bitmap(data, width, height, 4)
    embedded = len(data) - end == 768
    if embedded:
        palette = bytes(c * 4 for c in data[end:])
    elif end != len(data):
        raise ValueError('Unexpected CMP trailing bytes')
    return width, height, pixels, alpha, palette, embedded


def animation(data):
    count, maximum = struct.unpack_from('<II', data)
    if not 0 <= count < 10000 or 8 + count * 24 > len(data):
        raise ValueError('Invalid animation index')
    frames = []
    end = 8 + count * 24
    for i in range(count):
        x, y, width, height, length, offset = struct.unpack_from('<6I', data, 8+i*24)
        if offset != end or offset+length > len(data):
            raise ValueError('Non-contiguous animation frame')
        if width == height == 0 and x == 640 and y == 480 and length == 16:
            # Out-of-screen, empty image rectangles. Payload is stale, not pixel data.
            frames.append((x, y, width, height, bytearray(), bytearray()))
            end += length
            continue
        pixels, alpha, consumed = bitmap(data[offset:offset+length], width, height)
        if consumed != length:
            raise ValueError('Animation frame trailing bytes')
        frames.append((x, y, width, height, pixels, alpha))
        end += length
    if end != len(data):
        raise ValueError(f'Animation trailing bytes: {len(data)-end}')
    return frames, maximum


def png(path, width, height, pixels, alpha, palette):
    rgba = bytearray()
    for index, opacity in zip(pixels, alpha):
        rgba.extend(palette[index*3:index*3+3])
        rgba.append(opacity)
    stride = width * 4
    scanlines = b''.join(b'\0'+rgba[y*stride:(y+1)*stride] for y in range(height))
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB',width,height,8,6,0,0,0))
                     + chunk(b'IDAT',zlib.compress(scanlines)) + chunk(b'IEND',b''))
