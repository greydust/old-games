# 本機繁中版中文字型異常

**修正候選已撤回：使用者回報替換後文字與滑鼠均消失。**
下方字模比對僅為靜態證據，不能證明替換可修復整個遊戲。
先前把候選判定為已完成修復的結論不成立，仍須查DOSBox與INT 15h駐留服務的實際行為。
候選改名STR.UNVERIFIED.EXE，不再提供STR.EXE替換檔；工具另外輸出font-restore/STR.EXE供還原。
還原檔取自Dragon包且SHA256與修改前記錄一致：
`6d7d709c173ae530faa86f2474f2b312c76597fb15623e82a3c93072fa6379fb`。
使用者目前WDRAGON內STR.EXE已變成候選版本；工具不可誤把它當原版再輸出還原檔。
PLAY.BAT只有`start`，START.BAT呼叫YNVSHELL.COM，因此兩種啟動入口在此包相同。

## DOSBox-X 2026.06.02 隔離測試進度

已確認本機模擬器FileVersion/ProductVersion都是2026.06.02。
本機原設定為output=ttf、dosv=off、core=auto、autodbcs=true、country空白。
官方目前bios.cpp的INT15 AH=50分支也實作DBCS字型服務；它與STR攔截相同介面，
但僅這個發現不能斷言特定發行版有bug或TTF必然造成問題。
來源：https://github.com/joncampbell123/dosbox-x/blob/master/src/ints/bios.cpp

隔離副本採用output=surface、core=normal、dosv=off、country=1,437、
autodbcs=false、dosvfunc=false，啟動時明確CHCP 437。
用COM探針在STR安裝前後呼叫INT15 AX=5000、BX=0100、DX=1010、BP=0，
取得中文字型callback，並以CX=A55F（北）、ES:SI=32-byte緩衝呼叫。
初版探針未充分檢查回傳狀態，曾超時；後續先檢查AH=0才呼叫callback。
成功測試資料在local/extracted/WDRAGON/font-probe/，AFTER.BIN為4-byte callback、
2-byte flags及32-byte字模緩衝。原STR回傳END_S10圖片片段；候選STR回傳
與END_S13的「北」30-byte字模逐byte一致。兩組皆在CP437隔離設定下正常退出。

這是實際模擬器內的字型介面測試，仍不是完整遊戲與滑鼠測試。
`python tools/prepare_wdragon_font_test.py` 產生獨立遊戲副本與run-test.cmd，
結合上述設定及候選STR，供使用者驗證完整遊戲。保留STR.ORI為已核對的原檔，
不覆寫原始遊戲或模擬器全域設定；若輸出目錄已存在則停止，避免覆蓋測試副本的編輯／存檔。
在完整遊戲確認前，不重新將候選單檔宣稱為已修復版本。

`python tools/inspect_wdragon_fonts.py` 可重做檢查、字型對照圖與兩byte修正檔。
原始遊戲唯讀，輸出均在 `local/extracted/WDRAGON/font-fix/`，不進網站或Git。

## 已確認原因

本機STR.EXE長916 bytes，MZ載入映像從原檔512開始。
載入映像0x5D讀字函式開啟END_S10.DAT，依Big5碼換算字型索引後，
每字seek至索引×30、讀30 bytes；0xDF英文字函式開啟END_S11.DAT，每字15 bytes。
字串在原檔0x214及0x220，可從 `local/extracted/WDRAGON/str.dis` 核對。

但實際檔案為：

| 檔案 | bytes | 內容核對 |
| --- | ---: | --- |
| END_S10.DAT | 40806 | 開頭00 F4 01 00，128000-byte圖片RLE標頭，非原始30-byte字庫 |
| END_S11.DAT | 10637 | 同為128000-byte圖片RLE標頭 |
| END_S13.DAT | 404992 | 以STR的Big5索引讀30-byte字模可正確顯示臥龍傳北京 |
| END_S14.DAT | 3840 | 256×15的英文字模資料 |

圖像核對使用原程式的索引：
高byte<A4時(high-A1)×157；A4–C8時(high-A4)×157+408；
C9–F9時(high-C9)×157+5809；低byte>7E先扣22，再扣40加至索引。
中文每字15列，每列兩bytes。不是用作業系統字型替代來掩蓋原問題。

YNFONT.EXE雖包含STDFONT、CHIFONT等字串，僅憑字串不足以判定需要額外安裝中文字庫。
靜態發現STR.EXE檔名與字模內容不符，但這尚不足以判定執行中異常的完整原因。

## 修正與驗證範圍

修正STR.EXE內END_S10.DAT→END_S13.DAT、END_S11.DAT→END_S14.DAT。
僅原檔0x21A的0→3與0x226的1→4兩bytes改變；檔案長度、其餘指令完全相同。
不改名或覆蓋END_S10、END_S11，以免破壞原本圖片。
SHA256及修改位置存在輸出的verification.json。

目前只建議還原原始STR.EXE，完全結束DOSBox再啟動，避免舊駐留服務仍在記憶體。
不要繼續使用兩byte候選替換檔。原始local/binary內容不由工具修改。
目前已確認字模對照與兩byte差異，尚未在DOSBox完整試玩或驗證所有文字。
