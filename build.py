# 构建脚本:内联 Three.js + 游戏代码 + textures/ 目录下的照片贴图
import base64, os, json, re

d = os.path.dirname(os.path.abspath(__file__))
shell = open(os.path.join(d, '_shell.html'), encoding='utf-8').read()
three = open(os.path.join(d, 'three.min.js'), encoding='utf-8').read()
game = open(os.path.join(d, '_game3d.js'), encoding='utf-8').read()

# 版本号自动化(精修#136):VER 的唯一源在 _game3d.js,构建时提取并盖进 sw.js 的缓存键 ——
# #121 那次"大版本发了、缓存键没跟"就是双源各写各的后果;键随 VER 走后,升版本即自动换缓存。
m = re.search(r"const VER='(\d+\.\d+\.\d+)'", game)
assert m, '_game3d.js 缺少 const VER=x.y.z'
ver = m.group(1)

photo = {}
tdir = os.path.join(d, 'textures')
if os.path.isdir(tdir):
    for f in sorted(os.listdir(tdir)):
        if f.endswith('.jpg') and '_1k' not in f and '_raw' not in f:
            photo[f[:-4]] = 'data:image/jpeg;base64,' + base64.b64encode(
                open(os.path.join(tdir, f), 'rb').read()).decode()

assert '/*__PHOTOS__*/' in game, 'game js 缺少 PHOTO 注入点'
game = game.replace('/*__PHOTOS__*/', 'const PHOTO=' + json.dumps(photo) + ';', 1)
assert '/*__THREE__*/' in shell and '/*__GAME__*/' in shell
out = shell.replace('/*__THREE__*/', three, 1).replace('/*__GAME__*/', game, 1)
open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(out)

# sw.js 缓存键由本脚本盖章:手改会被下次构建覆盖(键格式 tornado-<VER>)
sw = open(os.path.join(d, 'sw.js'), encoding='utf-8').read()
sw2, n = re.subn(r"const CACHE='[^']*';", "const CACHE='tornado-%s';" % ver, sw, count=1)
assert n == 1, 'sw.js 缺少 CACHE 键行'
open(os.path.join(d, 'sw.js'), 'w', encoding='utf-8').write(sw2)

# size 用文件字节数:len(out) 是字符数,产物里有 CJK 注释时少约 1.5%(第 67 轮我把 1612896 当体积引用过)
print('built OK, VER=%s, photos: %d, index=%d bytes, sw cache=tornado-%s' % (
    ver, len(photo), os.path.getsize(os.path.join(d, 'index.html')), ver))
