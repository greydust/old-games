"""Export the original 256 world tiles for the scenario editor palette."""
from pathlib import Path
from shutil import copyfile
from unpack_toco import png


def export():
    source = Path('local/binary/WDRAGON')
    tiles = (source/'MMAP.MDL').read_bytes()
    raw_palette = (source/'GAMEPAL.BRG').read_bytes()[:48]
    assert len(tiles) == 256*128
    palette = bytes(raw_palette[c*3+k]*17 for c in range(16) for k in (1,2,0))
    output = bytearray(256*256)
    for tile in range(256):
        for y in range(16):
            for x in range(16):
                output[(tile//16*16+y)*256+tile%16*16+x] = sum(
                    ((tiles[tile*128+k*32+y*2+x//8] >> (7-x%8)) & 1) << k for k in range(4))
    destination = Path('assets/games/wdragon/tiles.png')
    destination.parent.mkdir(parents=True, exist_ok=True)
    png(destination,256,256,output,palette)
    copyfile(source/'MMAP.MAP',destination.parent/'world.map')


if __name__ == '__main__':
    export()
