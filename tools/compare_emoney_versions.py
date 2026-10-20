"""Compare the user-designated original emoney with modified emoney2, read-only."""
from pathlib import Path
from unpack_emoney import read_archive,sha,write_json

ROOT=Path(__file__).resolve().parents[1]


def compare():
    sources={name:ROOT/'local/binary'/name for name in ('emoney','emoney2')}
    archives={name:(p/'MONEY.DDT').read_bytes() for name,p in sources.items()}
    entries={name:read_archive(data)[1] for name,data in archives.items()}
    original,modified=entries['emoney'],entries['emoney2']
    assert [(r['name'],r['offset'],r['bytes']) for r,_ in original]==[(r['name'],r['offset'],r['bytes']) for r,_ in modified]
    changes=[]
    for (r,a),(s,b) in zip(original,modified):
        if a!=b:
            changes.append(dict(index=r['index'],name=r['name'],original_sha256=sha(a),modified_sha256=sha(b),
                                changed_bytes=[dict(offset=i,original=x,modified=y) for i,(x,y) in enumerate(zip(a,b)) if x!=y]))
    report=dict(original_source='local/binary/emoney',modified_source='local/binary/emoney2',
                identity_designation='user_confirmed',
                archives={name:sha(data) for name,data in archives.items()},
                executables={name:sha((path/'MONEY.EXE').read_bytes()) for name,path in sources.items()},
                entries=len(original),changed_entries=changes)
    old_exe=(sources['emoney2']/'MONEY.EXE').read_bytes()
    original_exe=(sources['emoney']/'MONEY.EXE').read_bytes()
    decoder=old_exe[0x2e07e:0x2e0fd]
    offset=original_exe.find(decoder)
    assert offset>=0 and original_exe.count(decoder)==1
    report['bitmap_decoder']=dict(modified_offset=0x2e07e,original_offset=offset,bytes=len(decoder),identical=True)
    write_json(ROOT/'local/extracted/emoney/version_comparison_emoney2.json',report)
    print(f'{len(changes)} changed entries, {sum(len(r["changed_bytes"]) for r in changes)} changed payload bytes')
    return report


if __name__=='__main__':compare()
