import os
from PIL import Image, ImageFilter
import numpy as np

img_path = r'C:\Users\amello\.gemini\antigravity-ide\brain\4c16f51f-c288-4609-8fc3-75b3c8259b49\selo_opcao1_objetivo_alcancado.png'
img = Image.open(img_path)
arr = np.array(img)
h, w, _ = arr.shape

# BFS segmentation
visited = np.zeros((h, w), dtype=bool)
mask = arr[:, :, 3] > 40
components = []

for y in range(h):
    for x in range(w):
        if mask[y, x] and not visited[y, x]:
            comp = []
            queue = [(y, x)]
            visited[y, x] = True
            while queue:
                cy, cx = queue.pop()
                comp.append((cy, cx))
                for dy, dx in [(-1,0), (1,0), (0,-1), (0,1), (-1,-1), (-1,1), (1,-1), (1,1)]:
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w:
                        if mask[ny, nx] and not visited[ny, nx]:
                            visited[ny, nx] = True
                            queue.append((ny, nx))
            if len(comp) > 10:
                ys = [p[0] for p in comp]
                xs = [p[1] for p in comp]
                components.append({
                    'size': len(comp),
                    'min_x': min(xs), 'max_x': max(xs),
                    'min_y': min(ys), 'max_y': max(ys),
                    'pixels': comp
                })

components.sort(key=lambda c: c['size'], reverse=True)
border_comp = components[0] # Border
check_comp = components[1]  # Checkmark
letter_comps = components[2:] # All letters

# Create letter mask and checkmark mask
letter_mask = np.zeros((h, w), dtype=bool)
for c in letter_comps:
    for y, x in c['pixels']:
        letter_mask[y, x] = True

check_mask = np.zeros((h, w), dtype=bool)
for y, x in check_comp['pixels']:
    check_mask[y, x] = True

border_mask = np.zeros((h, w), dtype=bool)
for y, x in border_comp['pixels']:
    border_mask[y, x] = True

# Helper to recolor masked pixels to white:
# For smooth anti-aliasing:
# If letter_mask is true, set RGB to (255, 255, 255), keeping existing alpha!
# -------------------------------------------------------------
# VARIANTE 1: Letras Brancas + Checkmark Vermelho + Borda Vermelha
# -------------------------------------------------------------
arr_v1 = arr.copy()
# Recolor letters to white
for y in range(h):
    for x in range(w):
        if letter_mask[y, x]:
            arr_v1[y, x, 0] = 255
            arr_v1[y, x, 1] = 255
            arr_v1[y, x, 2] = 255
        elif x >= 135 and arr_v1[y, x, 3] > 0 and not border_mask[y, x] and y > 20 and y < 145:
            # anti-aliased edge of letters
            arr_v1[y, x, 0] = 255
            arr_v1[y, x, 1] = 255
            arr_v1[y, x, 2] = 255

im_v1 = Image.fromarray(arr_v1, 'RGBA')

# -------------------------------------------------------------
# VARIANTE 2: Letras Brancas + Checkmark Branco + Borda Vermelha
# -------------------------------------------------------------
arr_v2 = arr.copy()
for y in range(h):
    for x in range(w):
        if letter_mask[y, x] or check_mask[y, x]:
            arr_v2[y, x, 0] = 255
            arr_v2[y, x, 1] = 255
            arr_v2[y, x, 2] = 255
        elif (x >= 135 or (x >= 28 and x <= 135)) and arr_v2[y, x, 3] > 0 and not border_mask[y, x] and y > 20 and y < 145:
            arr_v2[y, x, 0] = 255
            arr_v2[y, x, 1] = 255
            arr_v2[y, x, 2] = 255

im_v2 = Image.fromarray(arr_v2, 'RGBA')

# -------------------------------------------------------------
# VARIANTE 3: Selo Preenchido Vermelho com Letras e Check Brancos
# Interior do selo preenchido de vermelho (#d32f2f), letras e check brancos
# -------------------------------------------------------------
# Find interior by floodfill from outside corners to find exterior:
exterior = np.zeros((h, w), dtype=bool)
q = [(0, 0), (0, w-1), (h-1, 0), (h-1, w-1)]
for p in q:
    exterior[p] = True
while q:
    cy, cx = q.pop()
    for dy, dx in [(-1,0), (1,0), (0,-1), (0,1)]:
        ny, nx = cy + dy, cx + dx
        if 0 <= ny < h and 0 <= nx < w:
            # If not border and not already exterior
            if not border_mask[ny, nx] and not exterior[ny, nx]:
                exterior[ny, nx] = True
                q.append((ny, nx))

interior = ~exterior & ~border_mask

arr_v3 = np.zeros((h, w, 4), dtype=np.uint8)
# Fill interior with solid dark crimson / red stamp
red_fill = (195, 20, 30, 230)
red_border = (223, 20, 32, 255)
white_text = (255, 255, 255, 255)

for y in range(h):
    for x in range(w):
        if border_mask[y, x]:
            arr_v3[y, x] = red_border
        elif interior[y, x]:
            if letter_mask[y, x] or check_mask[y, x]:
                arr_v3[y, x] = white_text
            else:
                arr_v3[y, x] = red_fill

im_v3 = Image.fromarray(arr_v3, 'RGBA')

# Save all
out_dir_brain = r'C:\Users\amello\.gemini\antigravity-ide\brain\4c16f51f-c288-4609-8fc3-75b3c8259b49'
out_dir_tv = r'C:\Users\amello\OneDrive - MQHAIR\T.I\PROJETOS BI\ANTIGRAVITY\PROJETOS\DASHBOARD_tv\static\img'

im_v1.save(os.path.join(out_dir_brain, 'selo_opcao1_letras_brancas_check_vermelho.png'))
im_v1.save(os.path.join(out_dir_tv, 'selo_opcao1_letras_brancas_check_vermelho.png'))

im_v2.save(os.path.join(out_dir_brain, 'selo_opcao1_letras_e_check_brancos.png'))
im_v2.save(os.path.join(out_dir_tv, 'selo_opcao1_letras_e_check_brancos.png'))

im_v3.save(os.path.join(out_dir_brain, 'selo_opcao1_preenchido_vermelho.png'))
im_v3.save(os.path.join(out_dir_tv, 'selo_opcao1_preenchido_vermelho.png'))

# Also update the primary selo_opcao1_objetivo_alcancado.png with im_v1 (or im_v2) so teste_meta can load it
im_v1.save(os.path.join(out_dir_tv, 'selo_opcao1_objetivo_alcancado.png'))
im_v1.save(os.path.join(out_dir_brain, 'selo_opcao1_objetivo_alcancado.png'))

print('All 3 variations saved successfully!')
