"""Inspect WDRAGON glyph data; experimental loader is NOT a verified runtime fix."""
from pathlib import Path
import hashlib
import json
from unpack_toco import png

source = Path('local/binary/WDRAGON')
output = Path('local/extracted/WDRAGON/font-fix')
output.mkdir(parents=True, exist_ok=True)
original = (source / 'STR.EXE').read_bytes()
known_original = '6d7d709c173ae530faa86f2474f2b312c76597fb15623e82a3c93072fa6379fb'
if hashlib.sha256(original).hexdigest() == '26f790ad0c132f56080b6872b6d12bbf6f0f5166933ade45cac5bd756e7f4137':
    original = (Path('local/binary/Dragon hydeeric2002 ptt/dragon') / 'STR.EXE').read_bytes()
assert hashlib.sha256(original).hexdigest() == known_original
assert len(original) == 916 and original[:2] == b'MZ'
patched = original
for old, new in [(b'END_S10.DAT\0', b'END_S13.DAT\0'), (b'END_S11.DAT\0', b'END_S14.DAT\0')]:
    assert patched.count(old) == 1
    patched = patched.replace(old, new)
assert len((source / 'END_S14.DAT').read_bytes()) == 256 * 15
changes = [i for i, (a, b) in enumerate(zip(original, patched)) if a != b]
assert changes == [0x21a, 0x226]
# User reported missing text AND cursor after this candidate; do not publish it
# under the runnable replacement name or describe static glyphs as a runtime fix.
(output / 'STR.UNVERIFIED.EXE').write_bytes(patched)
restore = Path('local/extracted/WDRAGON/font-restore')
restore.mkdir(parents=True, exist_ok=True)
(restore / 'STR.EXE').write_bytes(original)

pixels = bytearray(400 * 160)
for row, name in enumerate(['END_S10.DAT', 'END_S13.DAT']):
    data = (source / name).read_bytes()
    for col, char in enumerate('臥龍傳北京'):
        high, low = char.encode('big5')
        base = ((high - 0xa1) * 157 if high < 0xa4 else
                (high - 0xa4) * 157 + 408 if high < 0xc9 else (high - 0xc9) * 157 + 5809)
        index = base + (low - 0x22 if low > 0x7e else low) - 0x40
        glyph = data[index * 30:index * 30 + 30].ljust(30, b'\0')
        for y in range(15):
            for x in range(16):
                if glyph[y * 2 + x // 8] >> (7 - x % 8) & 1:
                    for dy in range(4):
                        for dx in range(4):
                            pixels[(row * 80 + y * 4 + dy) * 400 + col * 80 + x * 4 + dx] = 1
png(output / 'font-comparison.png', 400, 160, pixels, bytes([0, 0, 0, 255, 255, 255]))
(output / 'verification.json').write_text(json.dumps({
    'original_sha256': hashlib.sha256(original).hexdigest(),
    'patched_sha256': hashlib.sha256(patched).hexdigest(),
    'changed_file_offsets': changes,
    'comparison_rows': ['END_S10.DAT', 'END_S13.DAT'],
    'comparison_text': '臥龍傳北京',
    'dosbox_tested': False,
    'user_runtime_result': 'Candidate caused missing text and mouse cursor; withdrawn.',
}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
assert hashlib.sha256((restore / 'STR.EXE').read_bytes()).hexdigest() == known_original
print('Diagnostic only; candidate withdrawn. Hash-verified original loader: ' + str(restore / 'STR.EXE'))
