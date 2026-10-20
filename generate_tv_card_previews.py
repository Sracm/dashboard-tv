import os
from PIL import Image, ImageDraw

brain_dir = r'C:\Users\amello\.gemini\antigravity-ide\brain\4c16f51f-c288-4609-8fc3-75b3c8259b49'
base_card = Image.open(os.path.join(brain_dir, 'card_zoom_opcao1.png')).convert('RGBA')
bw, bh = base_card.size

# Background patch over the old stamp: x=[480, 620], y=[10, 95]
bg_patch = Image.new('RGBA', (145, 90), color=(9, 19, 26, 255))

stamp_a = Image.open(os.path.join(brain_dir, 'selo_var_a_letras_brancas.png')).convert('RGBA')
stamp_b = Image.open(os.path.join(brain_dir, 'selo_var_b_letras_e_check_brancos.png')).convert('RGBA')
stamp_d = Image.open(os.path.join(brain_dir, 'selo_var_d_preenchido_vermelho.png')).convert('RGBA')

def create_stamped_card(stamp_img, label_text):
    card = base_card.copy()
    card.paste(bg_patch, (480, 10))
    
    # Target width 132px (matching TV card scale)
    st_w = 132
    st_h = int(st_w * (stamp_img.height / stamp_img.width))
    st_resized = stamp_img.resize((st_w, st_h), Image.Resampling.LANCZOS)
    
    # Rotate 14 deg tilt
    st_rotated = st_resized.rotate(14, expand=True, resample=Image.Resampling.BICUBIC)
    
    # Paste onto top-right corner
    card.paste(st_rotated, (484, 15), st_rotated)
    
    # Banner at bottom of card
    draw = ImageDraw.Draw(card)
    draw.rectangle([(0, bh - 28), (bw, bh)], fill=(13, 24, 34, 240))
    draw.text((15, bh - 21), label_text, fill=(229, 178, 68))
    return card

card_a = create_stamped_card(stamp_a, "OPCAO 1A: Letras Brancas + Borda e Checkmark Vermelhos")
card_b = create_stamped_card(stamp_b, "OPCAO 1B: Letras e Checkmark Brancos + Borda Vermelha")
card_d = create_stamped_card(stamp_d, "OPCAO 1D: Selo Preenchido Carmesim + Letras e Check Brancos")

total_w = bw * 2 + 30
total_h = bh * 2 + 80
board = Image.new('RGB', (total_w, total_h), color=(7, 13, 19))
bdraw = ImageDraw.Draw(board)
bdraw.rectangle([(0, 0), (total_w, 50)], fill=(13, 24, 34))
bdraw.text((25, 16), "DASHBOARD TV -- COMPARATIVO REAL NO CANAL (LETRA BRANCA)", fill=(255, 255, 255))

board.paste(card_a, (15, 65))
board.paste(card_b, (bw + 25, 65))
board.paste(card_d, (15, bh + 75))

quad4 = Image.new('RGB', (bw, bh), color=(14, 25, 36))
qdraw = ImageDraw.Draw(quad4)
qdraw.rectangle([(10, 10), (bw - 10, bh - 10)], outline=(0, 230, 118, 120), width=2)
qdraw.text((25, 35), "TESTE INTERATIVO NO NAVEGADOR:", fill=(0, 230, 118))
qdraw.text((25, 70), "http://localhost:5050/teste_meta", fill=(255, 255, 255))
qdraw.text((25, 115), "- Alterne entre 1A, 1B e 1D em tempo real", fill=(200, 205, 215))
qdraw.text((25, 145), "- Troque a posicao do selo (Canto, Velocimetro, Lateral)", fill=(200, 205, 215))
qdraw.text((25, 175), "- Simule cenarios ou percentuais de metas", fill=(200, 205, 215))
qdraw.text((25, 220), "Apos aprovar, aplicaremos na TV oficial (/tv e /empresa)!", fill=(229, 178, 68))
board.paste(quad4, (bw + 25, bh + 75))

out_board = os.path.join(brain_dir, 'preview_tv_comparativo_final.png')
board.save(out_board, 'PNG')
print('Board saved successfully:', out_board)
