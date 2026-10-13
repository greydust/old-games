from pathlib import Path
import re,sys
ranges=[tuple(int(x,16) for x in arg.split(':')) for arg in sys.argv[1:]]
for line in Path('local/toco-fpu.dis').read_text().splitlines():
 m=re.match(r'\s*([0-9a-f]+):',line)
 if m and any(a<=int(m[1],16)<b for a,b in ranges):print(line)
