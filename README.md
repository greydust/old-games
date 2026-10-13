# 老遊戲收藏館

純 HTML、CSS 與 JavaScript 的老遊戲展示網站，目前收錄《精靈幻界》。

## 本機預覽

需要 Node.js 20 以上，無須安裝套件。

```sh
npm run dev
```

開啟 http://127.0.0.1:5176 。遊戲 JSON 資料需要透過 HTTP 伺服器載入。

## GitHub Pages

在 GitHub 儲存庫的 Settings → Pages → Build and deployment，將 Source 設為 **GitHub Actions**。
推送至 `main` 後，`.github/workflows/pages.yml` 會建置並部署網站；也可在 Actions 手動執行。

```sh
npm run build
```

部署檔案位於 `dist/`。網站使用相對路徑，支援 GitHub Pages 的專案子路徑。

## 遊戲資料

`local/` 已加入 `.gitignore`，存放原始遊戲與解包成果，不會加入版本控制。
網站使用的標題圖獨立存於 `assets/games/toco/title.png`。
解包工具為 `tools/unpack_toco.py`；解包時需要本機的 `local/binary/TOCO`。

《精靈幻界》右側提供首頁、兵種、關卡與敵人三個分頁；兵種頁包含七系轉職分支、
31 個兵種圖像、一般升級範圍、轉職加成與技能。關卡頁收錄 31 個地圖及 33 個敵方模板。
`tools/extract_toco_units.py` 可從本機原始資料重新產生兵種與敵人素材。
資料來源與解析依據見 `tools/TOCO_FORMAT.md`。

新增遊戲時，在 `index.html` 加入導覽與內容區塊，並在 `app.js` 擴充頁面切換。
