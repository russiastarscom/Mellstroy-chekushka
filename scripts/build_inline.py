#!/usr/bin/env python3
# ============================================================
# Сборка автономного index.html для «Мелстрой: Мировая Чекушка»
# Берёт index.src.html (там <link> и <script src=...>) и встраивает
# css/style.css и все js/*.js ПРЯМО В ФАЙЛ.
# Результат: игра работает даже если на хостинг залит ОДИН index.html
# (спрайты из image/ необязательны — есть встроенные заглушки).
#
# Запуск после ЛЮБЫХ правок js/*.js или css/style.css:
#   python3 /home/z/my-project/scripts/build_inline.py
# ============================================================
import pathlib

GAME = pathlib.Path('/home/z/my-project/public/game')
ORDER = ['config', 'audio', 'sprites', 'levels', 'entities', 'ui', 'main']

def main():
    src_file = GAME / 'index.src.html'
    html = src_file.read_text(encoding='utf-8')

    # --- CSS ---
    css_tag = '<link rel="stylesheet" href="css/style.css">'
    assert css_tag in html, 'not found: ' + css_tag
    css = (GAME / 'css' / 'style.css').read_text(encoding='utf-8')
    assert '</style' not in css.lower(), 'CSS contains </style>'
    html = html.replace(css_tag, '<style>\n' + css + '\n</style>')

    # --- JS по порядку (порядок критичен!) ---
    for name in ORDER:
        tag = f'<script src="js/{name}.js"></script>'
        assert tag in html, 'not found: ' + tag
        js = (GAME / 'js' / f'{name}.js').read_text(encoding='utf-8')
        assert '</script' not in js.lower(), f'{name}.js contains </script>'
        assert '<!--' not in js, f'{name}.js contains <!--'
        html = html.replace(tag, '<script>\n' + js + '\n</script>')

    out = GAME / 'index.html'
    out.write_text(html, encoding='utf-8')
    print(f'OK -> {out} ({out.stat().st_size} bytes)')

if __name__ == '__main__':
    main()
