"""Lossless MONEY.DDT extraction; preserves duplicate names and archive variants."""
from pathlib import Path
import argparse
import hashlib
import json
import struct
from collections import Counter


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def write_json(path, data):
    save(path, (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))


def read_archive(data):
    count, = struct.unpack_from('<I', data)
    header = 4 + 16 * count
    if count < 2 or header > len(data):
        raise ValueError('Invalid index size')
    rows = []
    for i in range(count):
        raw, offset = struct.unpack_from('<12sI', data, 4 + i * 16)
        name = raw.split(b'\0', 1)[0].decode('ascii')
        if not name or any(c in name for c in '/\\:') or name in ('.', '..'):
            raise ValueError('Unsafe resource name')
        rows.append(dict(index=i, name=name, offset=offset))
    offsets = [r['offset'] for r in rows]
    if offsets[0] != header or offsets[-1] != len(data):
        raise ValueError('Index boundaries mismatch')
    if rows[-1]['name'] != '---.---' or any(a > b for a, b in zip(offsets, offsets[1:])):
        raise ValueError('Invalid terminal record or ordering')
    entries = []
    for row, end in zip(rows[:-1], offsets[1:]):
        payload = data[row['offset']:end]
        entries.append((dict(row, bytes=len(payload), sha256=sha(payload)), payload))
    return header, entries


def extract(source, destination):
    source, destination = source.resolve(), destination.resolve()
    if destination.is_relative_to(source) or source.is_relative_to(destination):
        raise ValueError('Source and destination must be separate trees')
    inventory = []
    for f in sorted(source.rglob('*')):
        if f.is_file():
            b = f.read_bytes()
            inventory.append(dict(file=f.relative_to(source).as_posix(), bytes=len(b), sha256=sha(b)))
    write_json(destination / 'inventory.json', inventory)
    versions = []
    for f in sorted(source.rglob('MONEY.DDT')):
        relative = f.relative_to(source)
        version = 'main' if relative.parent == Path('.') else relative.parent.as_posix()
        out = destination / 'versions' / version
        data = f.read_bytes()
        header, entries = read_archive(data)
        save(out / 'index.bin', data[:header])
        rebuilt = bytearray((out / 'index.bin').read_bytes())
        texts = []
        for row, payload in entries:
            filename = f"{row['index']:04d}_{row['name']}"
            save(out / 'entries' / filename, payload)
            rebuilt.extend((out / 'entries' / filename).read_bytes())
            # Only extract whole text resources, with strict encoding and no binary controls.
            if payload and not any(c < 32 and c not in (9, 10, 13) for c in payload):
                try:
                    text = payload.decode('cp950')
                except UnicodeDecodeError:
                    continue
                save(out / 'texts' / (filename + '.txt'), text.encode('utf-8'))
                texts.append(row['index'])
        if rebuilt != data:
            raise AssertionError('Round-trip mismatch')
        report = dict(source=relative.as_posix(), sha256=sha(data), header_bytes=header,
                      entries=[r for r, _ in entries], text_candidates=texts,
                      extensions=dict(Counter(Path(r['name']).suffix for r, _ in entries)),
                      round_trip_verified=True)
        write_json(out / 'manifest.json', report)
        versions.append((version, report))
        print(f'{version}: {len(entries)} entries; {len(texts)} text candidates; round-trip OK')
    base = next(r for v, r in versions if v == 'main')
    comparisons = []
    for version, report in versions:
        if version == 'main':
            continue
        if [(r['name'], r['offset'], r['bytes']) for r in base['entries']] != [(r['name'], r['offset'], r['bytes']) for r in report['entries']]:
            raise ValueError('Variant index differs; comparison requires further analysis')
        comparisons.append(dict(version=version, changed_entries=[a['index'] for a, b in zip(base['entries'], report['entries']) if a['sha256'] != b['sha256']]))
    write_json(destination / 'version_comparison.json', comparisons)
    print(json.dumps(comparisons, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, nargs='?', default=Path('local/binary/emoney'))
    parser.add_argument('destination', type=Path, nargs='?', default=Path('local/extracted/emoney'))
    args = parser.parse_args()
    extract(args.source, args.destination)
