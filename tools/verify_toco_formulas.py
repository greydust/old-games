"""Check the original executable bytes supporting the formula reconstruction.

Does not execute or modify the game. Offsets refer to this TOCO.EXE version.
"""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
exe = (root/'local/binary/TOCO/TOCO.EXE').read_bytes()
checks = {
    'two attack inputs': (0xd1fb, '8b7e068b7608'),
    'modifier integer divisor 80': (0xd275, 'bb500099f7fb'),
    'direction switch': (0xd2d1, '803e2412007503e9a001'),
    'scratch float read': (0xd2e7, 'cd3546f4'),
    'scratch float first write': (0xd2f2, 'cd355ef4'),
    'float conversion rounds toward zero': (0x4dbf, '804eff0c'),
    'counter divisor constant': (0x2f3a0+0x6ec, '0000a042'),
}
for name, (offset, pattern) in checks.items():
    expected = bytes.fromhex(pattern)
    assert exe[offset:offset+len(expected)] == expected, name
# No direct write/initialization of the scratch slot on the entry path.
prefix = exe[0xd1f5:0xd2e7]
for instruction in ['cd355ef4','cd3556f4','8946f4','c746f4']:
    assert bytes.fromhex(instruction) not in prefix
# Called routines receive only other local buffers: [bp-66] and [bp-106],
# each 40 bytes. Neither overlaps [bp-12..bp-9].
for start in [-66, -106]:
    assert start+40 <= -12
print(f'{len(checks)} executable signatures verified; scratch read precedes initialization')
