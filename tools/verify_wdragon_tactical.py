"""Verify tactical damage and return arithmetic against KI instruction bytes."""
from pathlib import Path
import json


def verify():
    code = Path('local/binary/WDRAGON/KI.EXE').read_bytes()[512:]
    checks = {
        0xb61d: '247f8a641802c4',
        0xb646: '2c32730232c0',
        0xb64c: '3c46725c',
        0xb692: '286503770e',
        0xb6cf: 'e80e363c19721a',
        0xb6d9: '8a64182a6518730232e4',
        0xb6e3: '80fc187602b418247f3ac47332',
        0xb703: '8a4418d0e8d0e8d0e822c07502b001284503',
        0xb710: 'b0012845037704c6450301',
        0xad4a: 'b51c',
        0xad93: 'b520',
        0xb9df: '807f0436740c807f0400750a',
        0xb9f1: 'd0e8d0e8',
        0xba08: '2847037718c6470301',
        0x9ee5: 'b063268645063c637705',
        0x9f14: 'b063268645063c637705',
        0x9f69: '8a440302440103d026884501',
        0x9f8e: '268a450626f76504f7f1',
    }
    for address, value in checks.items():
        expected = bytes.fromhex(value)
        assert code[address:address+len(expected)] == expected, hex(address)
    cases = 0
    for strength in range(256):
        for damage in range(256):
            raw = (strength-damage) & 255
            carry = strength < damage
            zero = strength == damage
            troop = raw if not carry and not zero else 0
            general = raw if not carry and not zero else 1
            assert troop == max(0,strength-damage)
            assert general == max(1,strength-damage)
            cases += 1
    report = {'instruction_checks':len(checks), 'damage_boundary_cases':cases,
              'scope':'Near-contact and projectile depletion; tactical soldier/morale return. Special orders and full victory logic remain unresolved.'}
    Path('local/extracted/WDRAGON/tactical-verification.json').write_text(
        json.dumps(report, indent=2), encoding='utf-8')
    print(f'Passed {len(checks)} instruction checks and {cases} damage boundary cases.')


if __name__ == '__main__':
    verify()
