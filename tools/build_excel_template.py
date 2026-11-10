# Builds assets/excel/cremer-recipes-template.xlsx from the Excel recipe finder
# (cremer-recipes.xlsx from the Packaging Lead Hub session): the same workbook
# with every recipe value removed, so it can sit in the public repository. The
# app fills it with the live recipes when someone downloads the Excel version.
import sys, re, json, zipfile, html
src_xlsx, src_html, out = sys.argv[1], sys.argv[2], sys.argv[3]
z = zipfile.ZipFile(src_xlsx)
files = {n: z.read(n) for n in z.namelist()}
DATA = json.loads(re.search(r'const DATA = (\{.*?\});\n', open(src_html).read()).group(1))
FIELDS = [f['key'] for f in DATA['fields'] if f['key'] != 'id']

def col(n):
    s = ''
    while n: n, r = divmod(n - 1, 26); s = chr(65 + r) + s
    return s
COLS = [col(i) for i in range(1, 44)]          # A..AQ: the recipe's own columns
KEYS = ['line', 'size', 'fg', 'bulk', None, None, 'id'] + FIELDS   # E = last updated, F = source
assert len(KEYS) == 43, len(KEYS)

def cellval(cx):
    m = re.search(r'<t[^>]*>(.*?)</t>', cx, re.S)
    if m: return html.unescape(m.group(1))
    m = re.search(r'<v>(.*?)</v>', cx)
    if m:
        v = m.group(1)
        if v == '': return None
        return int(v) if re.fullmatch(r'-?\d+', v) else float(v)
    return None

# 1. Check the column layout against the app's data: every recipe, every setting.
s3 = files['xl/worksheets/sheet3.xml'].decode()
rows = dict((int(r), body) for r, body in re.findall(r'<row r="(\d+)"[^>]*>(.*?)</row>', s3, re.S))
# a recipe is its line and workbook sheet (the same FG/bulk/size can have two sheets)
recs = {(r['line'], r['sheet']): r for r in DATA['recipes']}
assert len(recs) == len(DATA['recipes'])
checked = 0
for rn in range(3, 1001):
    cells = dict(re.findall(r'<c r="([A-Z]+)' + str(rn) + r'"[^>]*>(.*?)</c>', rows[rn]))
    cells = {k: cellval('<x>' + v + '</x>') if v else None for k, v in cells.items()}
    if cells.get('C') in (None, ''): continue
    key = (cells['A'], re.search(r'sheet "(.*)"$', cells['F']).group(1))
    r = recs.get(key); assert r, key
    for c, k in zip(COLS, KEYS):
        if k is None: continue
        want = r.get(k); got = cells.get(c)
        if want in (None, ''): assert got in (None, ''), (key, c, k, got)
        else: assert str(got) == str(want), (key, c, k, got, want)
    checked += 1
print('column layout matches the app for', checked, 'recipes')
assert checked == len(DATA['recipes'])

# 2. Empty every recipe row (keep styles and the helper formulas in AR..AU).
def blank_row(m):
    rn, attrs, body = m.group(1), m.group(2), m.group(3)
    if int(rn) < 3: return m.group(0)
    i = body.index(f'<c r="AR{rn}"')
    styles = dict(re.findall(r'<c r="([A-Z]+)' + rn + r'" s="(\d+)"', body[:i]))
    cells = ''.join(f'<c r="{c}{rn}" s="{styles[c]}" t="n"></c>' for c in COLS)
    return f'<row r="{rn}"{attrs}>{cells}{body[i:]}</row>'
s3 = re.sub(r'<row r="(\d+)"([^>]*)>(.*?)</row>', blank_row, s3, flags=re.S)
files['xl/worksheets/sheet3.xml'] = s3.encode()

# 3. Update History: empty (the app writes the live history).
s4 = files['xl/worksheets/sheet4.xml'].decode()
def blank_hist(m):
    rn = int(m.group(1))
    if rn < 5: return m.group(0)
    return re.sub(r'<c r="([A-E]\d+)" s="(\d+)"[^>]*>.*?</c>', r'<c r="\1" s="\2" t="n"></c>', m.group(0))
s4 = re.sub(r'<row r="(\d+)"[^>]*>.*?</row>', blank_hist, s4, flags=re.S)
files['xl/worksheets/sheet4.xml'] = s4.encode()

def set_text(xml, ref, text):
    pat = re.compile(rf'<c r="{ref}" s="(\d+)"[^>]*>.*?</c>', re.S)
    assert len(pat.findall(xml)) == 1, ref
    return pat.sub(lambda m: f'<c r="{ref}" s="{m.group(1)}" t="inlineStr"><is><t xml:space="preserve">{html.escape(text, quote=False)}</t></is></c>' if text else f'<c r="{ref}" s="{m.group(1)}" t="n"></c>', xml)

# 4. Find Recipe: the Teams notes become notes about this downloaded copy.
s1 = files['xl/worksheets/sheet1.xml'].decode()
s1 = set_text(s1, 'M10', 'THIS COPY')
s1 = set_text(s1, 'M12', '{{STAMP}}')
s1 = set_text(s1, 'M13', 'It doesn’t update: download again for the latest.')
s1 = set_text(s1, 'M18', 'Change recipes in the app: unlock as Super → Manage.')
files['xl/worksheets/sheet1.xml'] = s1.encode()

# 4b. A bigger Find Recipe page: columns, rows, text and logo all SCALE times
#     larger (the card still prints on one page: it is fit to the page). Its
#     cells get their own copies of their styles, so other sheets don't change.
SCALE = 1.35
st = files['xl/styles.xml'].decode()
fonts_m = re.search(r'(<fonts count=")(\d+)("[^>]*>)(.*?)(</fonts>)', st, re.S)
font_list = re.findall(r'<font>.*?</font>|<font/>', fonts_m.group(4), re.S)
xfs_m = re.search(r'(<cellXfs count=")(\d+)("[^>]*>)(.*?)(</cellXfs>)', st, re.S)
xf_list = re.findall(r'<xf [^>]*?/>|<xf [^>]*?>.*?</xf>', xfs_m.group(4), re.S)
assert len(font_list) == int(fonts_m.group(2)) and len(xf_list) == int(xfs_m.group(2))
def bigger_font(f):
    return re.sub(r'<sz val="([\d.]+)"/>', lambda m: f'<sz val="{round(float(m.group(1)) * SCALE * 2) / 2:g}"/>', f)
new_xf = {}
def big_style(old):
    old = int(old)
    if old not in new_xf:
        xf = xf_list[old]
        fid = int(re.search(r'fontId="(\d+)"', xf).group(1))
        font_list.append(bigger_font(font_list[fid]))
        xf = re.sub(r'fontId="\d+"', f'fontId="{len(font_list) - 1}"', xf)
        if 'applyFont=' not in xf: xf = xf.replace('<xf ', '<xf applyFont="1" ', 1)
        xf_list.append(xf); new_xf[old] = len(xf_list) - 1
    return new_xf[old]
s1 = files['xl/worksheets/sheet1.xml'].decode()
s1 = re.sub(r'(<c r="[A-Z]+\d+" s=")(\d+)"', lambda m: f'{m.group(1)}{big_style(m.group(2))}"', s1)
# the line under the logo: shorter words, and shrink to fit if still too long
d9 = int(re.search(r'<c r="D9" s="(\d+)"', s1).group(1))
xf_list[d9] = xf_list[d9].replace('<alignment ', '<alignment shrinkToFit="1" ', 1)
assert 'shrinkToFit' in xf_list[d9]
for a, b in [('"No match: check the search above"', '"No match: check the search"'), ('"Search for a recipe above"', '"Search above ↑"')]:
    assert s1.count(html.escape(a, quote=False)) == 1, a
    s1 = s1.replace(html.escape(a, quote=False), html.escape(b, quote=False))
s1 = re.sub(r'(<col width=")([\d.]+)("[^>]*min="(\d+)")', lambda m: f'{m.group(1)}{float(m.group(2)) * (SCALE if int(m.group(4)) < 13 else 1):g}{m.group(3)}', s1)
s1 = re.sub(r'(<row r="\d+" ht=")([\d.]+)"', lambda m: f'{m.group(1)}{round(float(m.group(2)) * SCALE, 1):g}"', s1)
s1 = s1.replace('<row r="8">', f'<row r="8" ht="{round(15 * SCALE, 1):g}" customHeight="1">')
s1 = s1.replace('defaultRowHeight="15"', f'defaultRowHeight="{round(15 * SCALE, 1):g}"')
files['xl/worksheets/sheet1.xml'] = s1.encode()
st = st[:fonts_m.start()] + f'{fonts_m.group(1)}{len(font_list)}{fonts_m.group(3)}{"".join(font_list)}{fonts_m.group(5)}' + st[fonts_m.end():]
xfs_m = re.search(r'(<cellXfs count=")(\d+)("[^>]*>)(.*?)(</cellXfs>)', st, re.S)
st = st[:xfs_m.start()] + f'{xfs_m.group(1)}{len(xf_list)}{xfs_m.group(3)}{"".join(xf_list)}{xfs_m.group(5)}' + st[xfs_m.end():]
files['xl/styles.xml'] = st.encode()
dr = files['xl/drawings/drawing1.xml'].decode()
dr = re.sub(r'<ext cx="(\d+)" cy="(\d+)"/>', lambda m: f'<ext cx="{round(int(m.group(1)) * SCALE)}" cy="{round(int(m.group(2)) * SCALE)}"/>', dr)
files['xl/drawings/drawing1.xml'] = dr.encode()
print('Find Recipe page made', SCALE, 'times bigger:', len(new_xf), 'styles copied')

# 5. How to Use: changes are made in the app, not in this copy.
s2 = files['xl/worksheets/sheet2.xml'].decode()
s2 = set_text(s2, 'B2', 'LineUp  ·  the Excel version of the Cremer Recipes app')
s2 = set_text(s2, 'C10', 'Print: File → Print → Print. Only the recipe card prints, on one page.')
s2 = set_text(s2, 'C13', '{{STAMP}} It doesn’t update itself: for the latest recipes, download it again from the app.')
s2 = set_text(s2, 'B18', 'SUPERVISORS: CHANGE, ADD OR REMOVE A RECIPE')
s2 = set_text(s2, 'C19', 'Make changes in the Cremer Recipes app: unlock it as Super → Manage. Everyone sees them straight away, and they go in the update history.')
s2 = set_text(s2, 'C20', 'Then download a fresh Excel copy from the app if you need one.')
s2 = set_text(s2, 'C21', 'Changes typed into this file stay in this file only: the app and other copies never see them.')
for ref in ['B22', 'C22', 'B24', 'B25', 'C25', 'B26', 'C26', 'B27', 'C27', 'B28', 'C28', 'B29', 'C29']:
    s2 = set_text(s2, ref, '')
files['xl/worksheets/sheet2.xml'] = s2.encode()

# 6. Nothing of the recipes may be left anywhere in the file: no cell text
#    is a recipe's FG item, bulk item or sheet name, and the Recipes sheet
#    holds no values at all in its recipe columns.
texts = set()
for n, b in files.items():
    if n.endswith('.xml'):
        texts |= {html.unescape(t) for t in re.findall(r'<t[^>]*>([^<]*)</t>', b.decode())}
names = {str(r['fg']) for r in DATA['recipes']} | {str(r['bulk']) for r in DATA['recipes'] if r.get('bulk')} | {r['sheet'] for r in DATA['recipes']}
leaks = sorted(texts & names)
assert not leaks, leaks[:5]
assert not any('Cremer Recipe Guide Line' in t for t in texts)
s3v = re.findall(r'<c r="([A-Z]+)(\d+)"[^>]*>(?:<is>|<v>)([^<]+)', files['xl/worksheets/sheet3.xml'].decode())
assert not [x for x in s3v if int(x[1]) >= 3], [x for x in s3v if int(x[1]) >= 3][:5]
print('no recipe data left in the template')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zo:
    for n in z.namelist(): zo.writestr(n, files[n])
print('wrote', out)
