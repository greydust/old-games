"""Prepare an isolated DOSBox-X font test. Never modify the original game/config."""
from pathlib import Path
import hashlib
import shutil

root = Path(__file__).resolve().parent.parent
source = root / 'local/binary/WDRAGON'
test = root / 'local/extracted/WDRAGON/font-test-20260602'
emulator = root / 'local/binary/doxbox-x/mingw-build/mingw/dosbox-x.exe'
loader = root / 'local/extracted/WDRAGON/font-fix/STR.UNVERIFIED.EXE'
original = root / 'local/extracted/WDRAGON/font-restore/STR.EXE'
assert emulator.is_file()
assert hashlib.sha256(loader.read_bytes()).hexdigest() == '26f790ad0c132f56080b6872b6d12bbf6f0f5166933ade45cac5bd756e7f4137'
assert hashlib.sha256(original.read_bytes()).hexdigest() == '6d7d709c173ae530faa86f2474f2b312c76597fb15623e82a3c93072fa6379fb'
test.mkdir(parents=True, exist_ok=False)
shutil.copytree(source, test / 'game')
shutil.copyfile(original, test / 'game/STR.ORI')
shutil.copyfile(loader, test / 'game/STR.EXE')
config = test / 'wdragon-test.conf'
config.write_text(
    '[sdl]\noutput=surface\nfullscreen=false\n'
    '[dosbox]\nmachine=svga_s3\n'
    '[cpu]\ncore=normal\n'
    '[dosv]\ndosv=off\n'
    '[dos]\ncountry=1,437\n'
    '[ttf]\nautodbcs=false\ndosvfunc=false\n'
    '[autoexec]\nmount c "' + str(test / 'game') + '"\nc:\nCHCP 437\nSTART.BAT\n', encoding='ascii')
(test / 'run-test.cmd').write_text(
    '@echo off\r\n"' + str(emulator) + '" -conf "' + str(config) + '" -noconsole -fastlaunch\r\n', encoding='ascii')
print(test / 'run-test.cmd')
