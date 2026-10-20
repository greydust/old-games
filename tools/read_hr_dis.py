"""Read address ranges from HR's local objdump listing."""
from pathlib import Path
import re
import sys
ranges = [tuple(int(v, 16) for v in arg.split(':')) for arg in sys.argv[1:]]
for line in Path('local/extracted/hr/analysis/main.dis').read_text().splitlines():
    match = re.match(r'\s*([0-9a-f]+):', line)
    if match and any(a <= int(match[1], 16) < b for a, b in ranges):
        print(line)
