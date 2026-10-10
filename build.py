# 构建脚本:内联 Three.js + 游戏代码 + textures/ 目录下的照片贴图
import base64, os, json

d = os.path.dirname(os.path.abspath(__file__))
shell = open(os.path.join(d, '_shell.html'), encoding='utf-8').read()
three = open(os.path.join(d, 'three.min.js'), encoding='utf-8').read()
game = open(os.path.join(d, '_game3d.js'), encoding='utf-8').read()

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
# size 用文件字节数:len(out) 是字符数,产物里有 CJK 注释时少约 1.5%(第 67 轮我把 1612896 当体积引用过)
print('built OK, photos:', len(photo), ', size =', os.path.getsize(os.path.join(d, 'index.html')), 'bytes')
