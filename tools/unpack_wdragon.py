"""Lossless WDRAGON resource extraction (Python standard library only).

Run: python tools/unpack_wdragon.py [source] [destination]
Graphics layout and game-data field semantics are not yet established.
"""
from pathlib import Path
import hashlib
import json
import struct
import sys


def decode_rle(data):
    """32-bit output size; identical byte pairs introduce an extra-byte count."""
    if len(data) < 4:
        raise ValueError('missing size')
    expected = int.from_bytes(data[:4], 'little')
    if not 0 < expected <= 16 * 1024 * 1024:
        raise ValueError('invalid size')
    output = bytearray()
    pos = 4
    while pos < len(data):
        value = data[pos]
        pos += 1
        output.append(value)
        if pos < len(data) and data[pos] == value:
            pos += 1
            if pos >= len(data):
                raise ValueError('truncated repeat')
            output.extend(bytes([value]) * (data[pos] + 1))
            pos += 1
        if len(output) > expected:
            raise ValueError('output exceeds declared size')
    if len(output) != expected:
        raise ValueError('output size mismatch')
    return bytes(output)


def extract(source, destination):
    source, destination = source.resolve(), destination.resolve()
    if source == destination or source in destination.parents or destination in source.parents:
        raise ValueError('source and destination must be separate directory trees')
    destination.mkdir(parents=True, exist_ok=True)
    manifest = []

    def save(relative, data):
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return relative

    def save_json(relative, data):
        return save(relative, json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8'))

    for path in sorted(source.rglob('*')):
        if not path.is_file():
            continue
        data = path.read_bytes()
        relative = path.relative_to(source).as_posix()
        row = dict(file=relative, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
                   status='preserved_uninterpreted', outputs=[])
        row['outputs'].append(save('raw/' + relative, data))
        try:
            decoded = decode_rle(data)
        except ValueError:
            pass
        else:
            row.update(status='rle_decoded', decoded_bytes=len(decoded),
                       graphics_layout='unconfirmed')
            row['outputs'].append(save('decoded/' + relative + '.bin', decoded))
        if path.name == 'TALK.DAT':
            table_end = struct.unpack_from('<H', data)[0]
            if table_end % 2 or not 0 < table_end <= len(data):
                raise ValueError('invalid TALK offset table')
            offsets = struct.unpack_from('<' + 'H' * (table_end // 2), data)
            if any(offset and not table_end <= offset <= len(data) for offset in offsets):
                raise ValueError('TALK offset outside payload')
            records = []
            for index, offset in enumerate(offsets):
                if offset == 0:
                    continue
                end = min((v for v in offsets if v > offset), default=len(data))
                block = data[offset:end]
                records.append(dict(index=index, offset=offset, end=end, hex=block.hex(),
                                    text=block.replace(b'\0', b'\n').decode('big5', errors='replace').rstrip('\n')))
            row['outputs'].append(save_json('text/dialogues.json', records))
            row['outputs'].append(save('text/dialogues.txt', '\n\n'.join(
                f"[{r['index']:04d} @ 0x{r['offset']:04x}]\n{r['text']}" for r in records).encode('utf-8')))
            row.update(status='dialogue_table_extracted', records=len(records))
        if path.suffix.upper() == '.BRG' and len(data) % 48 == 0:
            palettes = [list(data[i:i+48]) for i in range(0, len(data), 48)]
            row['outputs'].append(save_json('palettes/' + relative + '.json', dict(
                status='raw_components_confirmed; channel_order_unconfirmed',
                components_per_color=3, colors_per_palette=16, palettes=palettes)))
            row.update(status='palette_components_extracted', palettes=len(palettes))
        # Several files use a fixed 512-byte directory of uint32 offset/length pairs.
        if len(data) >= 512 and data[:4] == b'\0\2\0\0':
            entries = []
            for i in range(64):
                offset, length = struct.unpack_from('<II', data, i * 8)
                if offset == length == 0:
                    continue
                if offset < 512 or length == 0 or offset + length > len(data):
                    entries = []
                    break
                entries.append((i, offset, length))
            if entries:
                for i, offset, length in entries:
                    row['outputs'].append(save(f'blocks/{relative}/{i:03d}.bin', data[offset:offset+length]))
                row['outputs'].append(save_json(f'blocks/{relative}/index.json', [
                    dict(index=i, offset=o, bytes=n, interpretation='unconfirmed') for i, o, n in entries]))
                row.update(status='indexed_blocks_extracted', blocks=len(entries))
        manifest.append(row)
    save_json('manifest.json', manifest)
    summary = dict(files=len(manifest), rle_files=sum(r.get('decoded_bytes', 0) > 0 for r in manifest),
                   dialogues=sum(r.get('records', 0) for r in manifest),
                   indexed_blocks=sum(r.get('blocks', 0) for r in manifest))
    save_json('summary.json', summary)
    save('README.txt', ('WDRAGON / 臥龍傳 資源解包\n\n'
         'raw/: 所有原始檔的逐位元組副本；manifest.json 提供 SHA-256。\n'
         'decoded/: RLE 解壓資料，均已核對檔頭宣告長度與完整輸入。\n'
         'text/: TALK.DAT 的 16-bit 位址表與 Big5 對話；保留原始 hex，空位可能共用位址。\n'
         'blocks/: 512-byte 索引表中的資料區塊，保留索引、位址與長度。\n'
         'palettes/: 每組 16 色、每色 3 個原始分量；通道順序尚未確認。\n'
         '圖像排列、人物名稱對應、地圖及劇本欄位、音樂格式尚未解析。\n'
         '解壓成功不代表圖像及遊戲設定已完整解析；不將猜測當成原始設定。\n').encode('utf-8'))
    print(json.dumps(summary))


if __name__ == '__main__':
    extract(Path(sys.argv[1] if len(sys.argv) > 1 else 'local/binary/WDRAGON'),
            Path(sys.argv[2] if len(sys.argv) > 2 else 'local/extracted/WDRAGON'))
