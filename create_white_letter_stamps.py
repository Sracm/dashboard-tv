import os
from PIL import Image, ImageDraw, ImageFont
import numpy as np

img_path = r'C:\Users\amello\.gemini\antigravity-ide\brain\4c16f51f-c288-4609-8fc3-75b3c8259b49\selo_opcao1_vivid.png'
if not os.path.exists(img_path):
    img_path = r'C:\Users\amello\.gemini\antigravity-ide\brain\4c16f51f-c288-4609-8fc3-75b3c8259b49\selo_opcao1_objetivo_alcancado.png'

img = Image.open(img_path)
arr = np.array(img)
h, w, _ = arr.shape

# Precise masks
border_mask = (arr[:, :, 3] > 30) & ((np.arange(h)[:, None] < 24) | (np.arange(h)[:, None] > 136) | (np.arange(w)[None, :] < 28) | (np.arange(w)[None, :] > 414))
check_mask = (arr[:, :, 3] > 30) & (np.arange(w)[None, :] >= 28) & (np.arange(w)[None, :] < 135) & (np.arange(h)[:, None] >= 24) & (np.arange(h)[:, None] <= 136)
letter_mask = (arr[:, :, 3] > 30) & (np.arange(w)[None, :] >= 135) & (np.arange(w)[None, :] <= 414) & (np.arange(h)[:, None] >= 24) & (np.arange(h)[:, None] <= 136)

RED_COLOR = np.array([223, 20, 32], dtype=np.uint8)
WHITE_COLOR = np.array([255, 255, 255], dtype=np.uint8)

# 1. VARIANTE A: Letras Brancas + Checkmark Vermelho + Borda Vermelha
arr_a = arr.copy()
arr_a[border_mask, :3] = RED_COLOR
arr_a[check_mask, :3] = RED_COLOR
arr_a[letter_mask, :3] = WHITE_COLOR
im_a = Image.fromarray(arr_a, 'RGBA')

# 2. VARIANTE B: Letras Brancas + Checkmark Branco + Borda Vermelha
arr_b = arr.copy()
arr_b[border_mask, :3] = RED_COLOR
arr_b[check_mask, :3] = WHITE_COLOR
arr_b[letter_mask, :3] = WHITE_COLOR
im_b = Image.fromarray(arr_b, 'RGBA')

# 3. VARIANTE C: Totalmente Branco (Letras, Check e Borda Brancos)
arr_c = arr.copy()
arr_c[border_mask, :3] = WHITE_COLOR
arr_c[check_mask, :3] = WHITE_COLOR
arr_c[letter_mask, :3] = WHITE_COLOR
im_c = Image.fromarray(arr_c, 'RGBA')

# 4. VARIANTE D: Fundo Selo Vermelho Sólido + Letras & Checkmark Brancos
# Floodfill exterior
exterior = np.zeros((h, w), dtype=bool)
q = [(0, 0), (0, w-1), (h-1, 0), (h-1, w-1)]
for p in q: exterior[p] = True
while q:
    cy, cx = q.pop()
    for dy, dx in [(-1,0), (1,0), (0,-1), (0,1)]:
        ny, nx = cy + dy, cx + dx
        if 0 <= ny < h and 0 <= nx < w:
            if not border_mask[ny, nx] and not exterior[ny, nx]:
                exterior[ny, nx] = True
                q.append((ny, nx))

interior = ~exterior & ~border_mask
arr_d = np.zeros((h, w, 4), dtype=np.uint8)
fill_red = np.array([180, 15, 25, 240], dtype=np.uint8)
arr_d[border_mask] = np.array([223, 20, 32, 255], dtype=np.uint8)
arr_d[interior] = fill_red
arr_d[check_mask] = np.array([255, 255, 255, 255], dtype=np.uint8)
arr_d[letter_mask] = np.array([255, 255, 255, 255], dtype=np.uint8)
im_d = Image.fromarray(arr_d, 'RGBA')

# Save all standalone transparent PNGs
brain_dir = r'C:\Users\amello\.gemini\antigravity-ide\brain\4c16f51f-c288-4609-8fc3-75b3c8259b49'
tv_img_dir = r'C:\Users\amello\OneDrive - MQHAIR\T.I\PROJETOS BI\ANTIGRAVITY\PROJETOS\DASHBOARD_tv\static\img'

# Save default as Option A (Letters White, Check & Border Red)
im_a.save(os.path.join(brain_dir, 'selo_opcao1_objetivo_alcancado.png'))
im_a.save(os.path.join(tv_img_dir, 'selo_opcao1_objetivo_alcancado.png'))

im_a.save(os.path.join(brain_dir, 'selo_var_a_letras_brancas.png'))
im_a.save(os.path.join(tv_img_dir, 'selo_var_a_letras_brancas.png'))

im_b.save(os.path.join(brain_dir, 'selo_var_b_letras_e_check_brancos.png'))
im_b.save(os.path.join(tv_img_dir, 'selo_var_b_letras_e_check_brancos.png'))

im_c.save(os.path.join(brain_dir, 'selo_var_c_todo_branco.png'))
im_c.save(os.path.join(tv_img_dir, 'selo_var_c_todo_branco.png'))

im_d.save(os.path.join(brain_dir, 'selo_var_d_preenchido_vermelho.png'))
im_d.save(os.path.join(tv_img_dir, 'selo_var_d_preenchido_vermelho.png'))

# Now create an elegant visual comparison presentation on the dark background of Dashboard TV (#0a131a / #0d1117)
comp_w = 980
comp_h = 620
card_bg = Image.new('RGB', (comp_w, comp_h), color=(10, 19, 26))
draw = ImageDraw.Draw(card_bg)

# Header
draw.rectangle([(0, 0), (comp_w, 60)], fill=(13, 24, 34))
draw.text((30, 22), "DASHBOARD TV -- OPCOES DE CARIMBO 'OBJETIVO ALCANCADO' (LETRAS BRANCAS)", fill=(255, 255, 255))

# Draw 4 comparison boxes
boxes = [
    ("OPCAO 1A: Letras Brancas + Borda e Check Vermelhos", im_a, 40, 80),
    ("OPCAO 1B: Letras e Check Brancos + Borda Vermelha", im_b, 510, 80),
    ("OPCAO 1C: Carimbo Inteiro Branco", im_c, 40, 350),
    ("OPCAO 1D: Selo Preenchido Carmesim + Letras Brancas", im_d, 510, 350),
]

target_w = 420
target_h = int(target_w * (h / w))

for title, stamp_im, bx, by in boxes:
    # Outer box
    draw.rounded_rectangle([(bx, by), (bx + 440, by + 240)], radius=10, fill=(16, 28, 38), outline=(0, 230, 118, 80), width=1)
    draw.text((bx + 16, by + 14), title, fill=(229, 178, 68))
    # Paste stamp centered
    st_resized = stamp_im.resize((target_w, target_h), Image.Resampling.LANCZOS)
    paste_x = bx + (440 - target_w) // 2
    paste_y = by + 50 + (180 - target_h) // 2
    card_bg.paste(st_resized, (paste_x, paste_y), st_resized)

comp_out_path = os.path.join(brain_dir, 'preview_letras_brancas_comparativo.png')
card_bg.save(comp_out_path, 'PNG')
print('Comparison saved to:', comp_out_path)
