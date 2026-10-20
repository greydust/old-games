"""Rebuild and verify all local EMONEY extraction and website assets (Pillow required)."""
from extract_emoney import main
from export_emoney import local_structures,export_web
from verify_emoney import verify

if __name__=='__main__':
    main()
    local_structures()
    export_web()
    verify()
