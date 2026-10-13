"""Export the original title screen used by D7OPEN.EXE."""
from pathlib import Path
from unpack_wdragon import decode_rle
from unpack_toco import png


def export(source=Path('local/binary/WDRAGON'), destination=Path('assets/games/wdragon/title.png')):
    program = (source / 'D7OPEN.EXE').read_bytes()[0x200:]
    # The ending sequence draws two 200-line halves and selects palette 5.
    assert program[0x4f1:0x4f4] == b'\xbb\x80\x3e'
    assert program[0x500:0x503] == b'\xb8\x05\x10'
    data = decode_rle((source / 'OPEN_S6.DAT').read_bytes())
    assert len(data) == 128000
    components = (source / 'OPENPAL.BRG').read_bytes()[5*48:6*48]
    # Palette routine 0xAE0 writes R/G/B from the source B/R/G triplet.
    palette = bytes(components[color*3+channel]*17
                    for color in range(16) for channel in (1, 2, 0))
    pixels = bytearray(640*400)
    for y in range(400):
        for x in range(640):
            offset = (y % 200)*80+x//8
            pixels[y*640+x] = sum(((data[(y//200)*64000+plane*16000+offset]
                                   >> (7-x%8)) & 1) << plane for plane in range(4))
    png(destination, 640, 400, pixels, palette)


if __name__ == '__main__':
    export()
