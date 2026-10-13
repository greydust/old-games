"""Check combat equations against instruction-level arithmetic and source bytes."""
import json
from pathlib import Path


def registers(w, l, s, r, base):
    # KI load image 52e7..5304, preserving byte arithmetic.
    dl, dh = w, l
    ch = (dl << 1) & 255
    if dl < dh or r == 0:
        if dl >= dh:
            dh = dl
        ch = dh
        dh >>= 2
        ch = (ch - dh + l) & 255
    # 5318..5320 and the unusual byte rearrangement in 5327..5335.
    ax = (ch << 4) // (16 - s)
    product = ax * base
    ax, dx = product & 65535, product >> 16
    ax = ((dx & 255) << 8) | (ax >> 8)
    dx >>= 8
    for _ in range(2):
        ax = (ax >> 1) | ((dx & 1) << 15)
        dx >>= 1
    return ax


def equation(w, l, s, r, base):
    c = 2*w if w >= l and r else (w-w//4+l if w >= l else 2*l-l//4)
    return (base * (16*c//(16-s)) // 1024) & 65535


def verify():
    code = Path('local/binary/WDRAGON/KI.EXE').read_bytes()[512:]
    checks = {
        0x52e7: '8b9751428aead0e53ad67209',
        0x52f6: '2403750e8af28aeed0eed0ee2aee02af5242',
        0x5314: 'b3102ad88ac58ae7d3e033d2f7f3',
        0x5325: 'f7e28ac48ae28ad632f6d1ead1d8d1ead1d88bd0',
        0x9b43: '8ac2d0e202d5d0e226885518',
        0x9b7c: '02f58ad832ff4b8ad6d0e202d62e02970f9cd0ead0ea',
        # Formation DI points at faction+4; troop code k debits DI+2*(k-1).
        0x6cb0: '0504008bf8',
        0x46dc: '32ff4bd1e303eb03df268b07',
        0x46fc: '262907884401',
        # Recruitment dialogues 18/19/20 write the three consecutive limits.
        0x67e6: 'b91200',
        0x6801: '2ea3120d',
        0x6806: 'b91300',
        0x6821: '2ea3140d',
        0x6826: 'b91400',
        0x6841: '2ea3160d',
    }
    for address, value in checks.items():
        expected = bytes.fromhex(value)
        assert code[address:address+len(expected)] == expected, hex(address)
    assert list(code[0x9c0f:0x9c12]) == [30, 4, 12]
    talk = Path('local/binary/WDRAGON/TALK.DAT').read_bytes()
    for index, name in zip((18,19,20), ('騎兵','弓兵','步兵')):
        start = int.from_bytes(talk[index*2:index*2+2], 'little')
        end = int.from_bytes(talk[(index+1)*2:(index+1)*2+2], 'little')
        assert name.encode('big5') in talk[start:end].replace(b'\0', b'')
    count = 0
    # Entire original-game attribute domain, all random branches and edge bases.
    for w in range(1, 16):
        for l in range(1, 16):
            for s in range(11):
                for r in range(4):
                    for base in (0, 1, 1023, 1024, 32768, 65535):
                        assert registers(w,l,s,r,base) == equation(w,l,s,r,base)
                        count += 1
                for bonus in (30,4,12):
                    dl = (l+s) & 255
                    actual = (((dl << 1) + dl + bonus) & 255) >> 2
                    assert actual == (3*(l+s)+bonus)//4
                assert (((w << 1) + s) << 1) & 255 == 4*w+2*s
    report = {'auto_cases': count, 'instruction_checks': len(checks),
              'c20_examples': {s:320//(16-s) for s in (0,4,8,10)},
              'troop_bonuses': {'1': ['cavalry',30], '2':['archer',4], '3':['infantry',12]},
              'scope':'Combat parameters, not a complete casualty or victory formula.'}
    Path('local/extracted/WDRAGON/combat-formula-verification.json').write_text(
        json.dumps(report, indent=2), encoding='utf-8')
    print(f'Passed {count} auto-combat arithmetic cases and all tactical attribute combinations.')


if __name__ == '__main__':
    verify()
