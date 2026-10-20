"""HR LZSS and bitmap decoding; see HR_FORMAT.md for evidence."""
from pathlib import Path
import struct
import zlib
from unpack_toco import png, chunk


def default_palette(exe):
    """Resident palette passed to the game's VGA DAC routine."""
    return bytes(v for w in struct.unpack_from('<16H', exe, 0x4cdca)
                 for v in [(w >> 8) & 15, (w >> 4) & 15, w & 15])


def country_map(data):
    size = int.from_bytes(data[:4], 'little')
    if size % 2 or size + 8 > len(data):
        raise ValueError('Invalid sparse map index')
    commands = struct.unpack_from('<' + 'H'*(size//2), data, 4)
    raw = decompress(data[size+4:])
    packed = bytearray(128000)
    cursor = consumed = 0
    for i, command in enumerate(commands):
        count = (command+2)*4
        if cursor+count > len(packed):
            raise ValueError('Map index exceeds canvas')
        if i % 2:
            if consumed+count > len(raw):
                raise ValueError('Missing map pixels')
            packed[cursor:cursor+count] = raw[consumed:consumed+count]
            consumed += count
        cursor += count
    if cursor != len(packed) or consumed != len(raw):
        raise ValueError('Map size mismatch')
    return struct.pack('<HHB', 640, 400, 128) + packed


def frames(data):
    """Walk concatenated uncompressed five-byte bitmap headers."""
    pos = 0
    while pos < len(data):
        if pos+5 > len(data):
            raise ValueError('Truncated frame header')
        w,h,mode = struct.unpack_from('<HHB', data, pos)
        if not w or not h or mode not in (0,1,128):
            raise ValueError('Invalid frame header')
        length = 5 + (((w+1)//2)*h if mode==128 else ((w+7)//8)*h*(5 if mode==1 else 4))
        if pos+length > len(data):
            raise ValueError('Truncated frame')
        yield data[pos:pos+length]
        pos += length


def decompress(data):
    if len(data) < 5:
        raise ValueError('Missing compressed header')
    size = int.from_bytes(data[:4], 'little')
    if not 0 < size <= 16_000_000:
        raise ValueError('Invalid expanded size')
    window = bytearray(1024)
    wp, pos = 958, 4
    out = bytearray()
    while len(out) < size:
        if pos >= len(data):
            raise ValueError('Truncated flags')
        flags = data[pos]
        pos += 1
        for bit in range(8):
            if len(out) == size:
                break
            if flags & (1 << bit):
                if pos >= len(data):
                    raise ValueError('Truncated literal')
                values = [data[pos]]
                pos += 1
                for value in values:
                    out.append(value)
                    window[wp] = value
                    wp = (wp + 1) & 1023
            else:
                if pos + 2 > len(data):
                    raise ValueError('Truncated reference')
                a, b = data[pos:pos+2]
                pos += 2
                rp, count = a | ((b & 192) << 2), (b & 63) + 3
                if len(out) + count > size:
                    raise ValueError('Reference exceeds expanded size')
                for j in range(count):
                    value = window[(rp+j) & 1023]
                    out.append(value)
                    window[wp] = value
                    wp = (wp + 1) & 1023
    if pos != len(data):
        raise ValueError(f'Trailing compressed bytes: {len(data)-pos}')
    return bytes(out)


def bitmap(data):
    if len(data) < 5:
        raise ValueError('Missing bitmap header')
    width, height, mode = struct.unpack_from('<HHB', data)
    if not 0 < width <= 4096 or not 0 < height <= 4096:
        raise ValueError('Invalid bitmap dimensions')
    payload = data[5:]
    if mode == 128 and len(payload) == ((width+1)//2)*height:
        stride = (width+1)//2
        pixels = bytes((payload[y*stride+x//2] >> (4 if x%2 == 0 else 0)) & 15
                       for y in range(height) for x in range(width))
        return width, height, pixels, None
    stride = (width+7)//8
    planes = 5 if mode == 1 else 4
    if mode not in (0, 1) or len(payload) != stride*height*planes:
        raise ValueError(f'Unconfirmed bitmap layout: {width}x{height}, mode={mode}, bytes={len(payload)}')
    pixels = bytearray(width*height)
    mask = bytearray(width*height) if mode == 1 else None
    for y in range(height):
        for x in range(width):
            address = y*stride*planes + x//8
            bit = 7-x%8
            pixels[y*width+x] = sum(((payload[address+p*stride] >> bit)&1)<<p for p in range(4))
            if mask is not None:
                mask[y*width+x] = (payload[address+4*stride] >> bit)&1
    return width, height, bytes(pixels), bytes(mask) if mask is not None else None


def write_bitmap(data, palette, target):
    w, h, pixels, mask = bitmap(data)
    if len(palette) != 48 or max(palette) > 15:
        raise ValueError('Expected a 16-colour 4-bit RGB palette')
    if mask is None:
        png(target, w, h, pixels, bytes(v*17 for v in palette))
    else:
        rgba = bytes(v for i,p in enumerate(pixels) for v in
                     [palette[3*p]*17,palette[3*p+1]*17,palette[3*p+2]*17,255 if mask[i] or p else 0])
        raw = b''.join(b'\0'+rgba[y*w*4:(y+1)*w*4] for y in range(h))
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))
                           +chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))
    return w, h


def write_pcx(data, target):
    """Decode the game's standard 8-bit single-plane PCX resources."""
    if data[:4] != bytes([10,5,1,8]) or data[65] != 1 or data[-769] != 12:
        raise ValueError('Unsupported PCX variant')
    x0,y0,x1,y1 = struct.unpack_from('<4H',data,4)
    w,h,stride = x1-x0+1,y1-y0+1,word_at(data,66)
    out=bytearray()
    pos=128
    while pos<len(data)-769:
        value=data[pos];pos+=1
        count=1
        if value>=192:
            count=value&63
            value=data[pos];pos+=1
        out.extend(bytes([value])*count)
    if len(out)!=stride*h:
        raise ValueError('PCX expanded size mismatch')
    pixels=b''.join(out[y*stride:y*stride+w] for y in range(h))
    png(target,w,h,pixels,data[-768:])
    return w,h


def word_at(data, offset):
    return struct.unpack_from('<H',data,offset)[0]
