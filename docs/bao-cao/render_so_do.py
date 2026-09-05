"""Render mọi khối sơ đồ trong báo cáo thành PNG độ phân giải cao.

Hỗ trợ hai ngôn ngữ sơ đồ:
  ```mermaid   — kiến trúc, tuần tự, máy trạng thái, luồng
  ```plantuml  — sơ đồ UML cần đúng ký hiệu chuẩn (use case, lớp)

Cả hai đều dựng cục bộ, không gọi dịch vụ ngoài. PlantUML dùng bản engine
biên dịch sang JavaScript (@plantuml/core) nên không cần Java hay Graphviz.

Ảnh được đánh số theo đúng thứ tự xuất hiện của khối trong tệp Markdown, vì
xuat_bao_cao_docx.py tiêu thụ so-do-1, so-do-2, ... tuần tự theo thứ tự đó.

Cách dùng:
    python render_so_do.py                 -> báo cáo CNPM (mặc định)
    python render_so_do.py TEN_FILE.md     -> báo cáo khác
"""
import functools
import http.server
import re
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent

# Tên báo cáo BẮT BUỘC truyền vào — xem ghi chú cùng chỗ trong `xuat_bao_cao_docx.py`.
if len(sys.argv) <= 1:
    sys.exit("Cần tên tệp báo cáo, ví dụ:\n"
             "    python docs/bao-cao/render_so_do.py BAO_CAO_<HỌC_PHẦN>.md")
SRC = HERE / sys.argv[1]
if not SRC.is_file():
    sys.exit(f"Không thấy {SRC.name}")
OUT = HERE / "output" / f"_diagrams_{SRC.stem[:18]}"

MERMAID = HERE / "_mermaid" / "mermaid.min.js"
PLANTUML = HERE / "_plantuml"

OUT.mkdir(parents=True, exist_ok=True)

# Lấy cả ngôn ngữ lẫn nội dung, giữ nguyên thứ tự xuất hiện.
KHOI = re.findall(r"```(mermaid|plantuml)\n(.*?)```",
                  SRC.read_text(encoding="utf-8"), flags=re.S)
_dem = {"mermaid": 0, "plantuml": 0}
for _ngon_ngu, _ in KHOI:
    _dem[_ngon_ngu] += 1
print(f"tìm thấy {len(KHOI)} sơ đồ "
      f"({_dem['mermaid']} mermaid · {_dem['plantuml']} plantuml)")

TRANG = """<!doctype html><html><head><meta charset="utf-8">
<style>
  body{margin:0;padding:24px;background:#fff;font-family:"Times New Roman",serif}
  #d{display:inline-block}
  .mermaid{font-family:"Segoe UI",Arial,sans-serif !important}
  #d svg{background:#fff}
</style></head><body><div id="d"></div>
<script src="/mermaid.min.js"></script>
<script src="/viz-global.js"></script>
<script type="module">
  import { renderToString } from "/plantuml.js";
  window.__puml = (ma) => new Promise((ok, loi) =>
      renderToString(ma.split("\\n"), ok, loi));
  window.__san_sang = true;
</script>
<script>
  mermaid.initialize({
    startOnLoad:false, theme:'base', securityLevel:'loose',
    fontFamily:'Segoe UI, Arial, sans-serif', fontSize:15,
    themeVariables:{
      primaryColor:'#eef3fb', primaryTextColor:'#111', primaryBorderColor:'#39618f',
      lineColor:'#39618f', secondaryColor:'#f6f6f6', tertiaryColor:'#fbfbfb',
      clusterBkg:'#fafcff', clusterBorder:'#c3d4e8'
    },
    flowchart:{useMaxWidth:false, htmlLabels:true, curve:'basis', padding:14},
    er:{useMaxWidth:false}, state:{useMaxWidth:false}
  });

  // Chuẩn hoá SVG sau khi dựng: bỏ width/height cố định rồi đặt lại đúng
  // bằng viewBox, để ảnh chụp không bị co hay bị cắt.
  function dat_co(el) {
    el.removeAttribute('width'); el.removeAttribute('height');
    const vb = el.viewBox.baseVal;
    el.setAttribute('width', vb.width);
    el.setAttribute('height', vb.height);
    return [vb.width, vb.height];
  }

  window.__render = async (ngon_ngu, ma) => {
    const d = document.getElementById('d');
    if (ngon_ngu === 'plantuml') {
      d.innerHTML = await window.__puml(ma);
    } else {
      const {svg} = await mermaid.render('g'+Math.random().toString(36).slice(2), ma);
      d.innerHTML = svg;
    }
    const el = d.querySelector('svg');
    if (!el) throw new Error('không dựng được SVG');
    // PlantUML báo lỗi cú pháp bằng chính ảnh chứ không ném ngoại lệ.
    const chu = el.textContent || '';
    if (/syntax error|cannot find|Error line/i.test(chu)) {
      throw new Error('PlantUML lỗi cú pháp: ' + chu.slice(0, 300));
    }
    return dat_co(el);
  };
</script></body></html>"""


def phuc_vu(thu_muc: Path):
    """Mở một máy chủ tĩnh cục bộ; ES module không nạp được qua file://."""
    xu_ly = functools.partial(http.server.SimpleHTTPRequestHandler,
                              directory=str(thu_muc))
    socketserver.TCPServer.allow_reuse_address = True
    may_chu = socketserver.TCPServer(("127.0.0.1", 0), xu_ly)
    threading.Thread(target=may_chu.serve_forever, daemon=True).start()
    return may_chu, may_chu.server_address[1]


def main():
    (PLANTUML / "_trang.html").write_text(TRANG, encoding="utf-8")
    (PLANTUML / "mermaid.min.js").write_bytes(MERMAID.read_bytes())
    may_chu, cong = phuc_vu(PLANTUML)
    try:
        with sync_playwright() as pw:
            br = pw.chromium.launch()
            pg = br.new_page(viewport={"width": 1800, "height": 1200},
                             device_scale_factor=3)
            pg.goto(f"http://127.0.0.1:{cong}/_trang.html", wait_until="load")
            pg.wait_for_function("window.__san_sang === true", timeout=30000)

            for n, (ngon_ngu, ma) in enumerate(KHOI, 1):
                w, h = pg.evaluate("([l, m]) => window.__render(l, m)",
                                   [ngon_ngu, ma.strip()])
                pg.set_viewport_size({"width": int(w) + 60, "height": int(h) + 60})
                el = pg.query_selector("#d svg")
                f = OUT / f"so-do-{n}.png"
                el.screenshot(path=str(f), omit_background=False)
                ti_le = w / h if h else 0
                print(f"  so-do-{n}.png  [{ngon_ngu}]  {int(w)}x{int(h)}px  "
                      f"tỉ lệ {ti_le:.2f}  -> {f.stat().st_size // 1024} KB")
            br.close()
    finally:
        may_chu.shutdown()
        (PLANTUML / "_trang.html").unlink(missing_ok=True)
        (PLANTUML / "mermaid.min.js").unlink(missing_ok=True)
    print(f"xong, lưu tại {OUT}")


main()
