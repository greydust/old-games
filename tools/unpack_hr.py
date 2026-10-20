"""Extract HR indexed resources without changing the original files."""
from pathlib import Path
import argparse
import hashlib
import json
import struct


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def extract(source, destination):
    if not source.is_dir():
        raise ValueError(f'Source directory does not exist: {source}')
    if destination.resolve().is_relative_to(source.resolve()):
        raise ValueError('Destination must be outside the original directory')
    report = []
    for f in sorted(source.iterdir()):
        if not f.is_file():
            continue
        data = f.read_bytes()
        raw_path = destination / 'raw' / f.name
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        raw_path.write_bytes(data)
        row = dict(file=f.name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), status='not_decoded')
        if f.suffix.upper() in ('.MRG', '.MES'):
            count, first = struct.unpack_from('<HI', data)
            if first < 6 or (first - 2) % 4 or first > len(data):
                raise ValueError(f'{f.name}: invalid index header')
            offsets = list(struct.unpack_from('<' + 'I' * ((first - 2) // 4), data, 2))
            if offsets[0] != first or any(a > b for a, b in zip(offsets, offsets[1:])):
                raise ValueError(f'{f.name}: invalid index ordering')
            # COUNTRY.MES has a terminal offset one byte beyond EOF.
            if offsets[-1] > len(data) and not (f.name.upper() == 'COUNTRY.MES' and offsets[-1] == len(data) + 1):
                raise ValueError(f'{f.name}: index exceeds EOF')
            entries = []
            ends = offsets[1:] + ([len(data)] if f.suffix.upper() == '.MRG' else [])
            for i, (start, end) in enumerate(zip(offsets, ends)):
                payload = data[start:min(end, len(data))]
                out = destination / 'entries' / f.name / f'{i:04d}.bin'
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(payload)
                entries.append(dict(index=i, offset=start, end=end, bytes=len(payload)))
            row.update(status='split', header_count=count, offsets=offsets, entries=entries,
                       trailing_bytes=max(0, len(data)-offsets[-1]))
            if f.suffix.upper() == '.MES':
                texts = []
                for entry in entries:
                    raw = data[entry['offset']:min(entry['end'], len(data))].split(b'\0', 1)[0]
                    try:
                        text = raw.decode('cp950')
                        status = 'decoded'
                    except UnicodeDecodeError:
                        text = raw.decode('cp950', errors='replace')
                        status = 'encoding_unconfirmed'
                    texts.append(dict(index=entry['index'], text=text, status=status))
                save_json(destination / 'texts' / (f.stem + '.json'), texts)
                row.update(status='text_extracted', text_entries=len(texts),
                           encoding_unconfirmed=sum(t['status'] != 'decoded' for t in texts))
        elif f.suffix.upper() == '.TXT':
            text = data.decode('cp950', errors='strict').replace('\r\n', '\n')
            out = destination / 'texts' / (f.stem + '.txt')
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(text, encoding='utf-8')
            row['status'] = 'text_extracted'
        report.append(row)
    save_json(destination / 'manifest.json', report)
    print(f'{len(report)} files inventoried; {sum(r["status"] == "split" for r in report)} archives split; '
          f'{sum(r["status"] == "text_extracted" for r in report)} text resources extracted')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', nargs='?', type=Path, default=Path('local/binary/HR'))
    parser.add_argument('destination', nargs='?', type=Path, default=Path('local/extracted/hr'))
    args = parser.parse_args()
    extract(args.source, args.destination)
