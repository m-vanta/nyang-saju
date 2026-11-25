#!/usr/bin/env python3
import http.server, json, os, socketserver, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8799

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a):
        pass

srv = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()

JS = r"""
() => {
  const S = window.NyangSaju;
  const out = [];
  for (let y = 1985; y <= 2000; y++) {
    for (let m = 1; m <= 12; m++) {
      for (let d = 3; d <= 27; d += 4) {
        let c;
        try { c = S.computePillars({year:y, month:m, day:d, calendar:'solar', hourIdx:6}); } catch(e) { continue; }
        out.push({y,m,d, dm:c.dayMasterName, dmIdx:c.dayMaster,
          dist:c.dist.map(x=>x.elem+x.count).join(' '), strongest:c.strongest.elem+c.strongest.count,
          ten:c.tenCount, total:c.total, dohwa:!!c.dohwa,
          dae: c.daewoon && c.daewoon.current ? c.daewoon.current.ko : null});
      }
    }
  }
  return out;
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="load")
    rows = pg.evaluate(JS)
    b.close()
srv.shutdown()

groups = {}
for r in rows:
    groups.setdefault(r['dm'], []).append(r)
for dm, arr in groups.items():
    if dm != '계수':
        continue
    print(dm, len(arr))
    for r in arr[:40]:
        print(r['y'], r['m'], r['d'], '| 강:', r['strongest'], '| 오행:', r['dist'], '| 십성:', {k:v for k,v in r['ten'].items() if v}, '| 도화:', r['dohwa'], '| 대운:', r['dae'])
json.dump(rows, open('/tmp/scan-days.json','w'))
print('total', len(rows))
