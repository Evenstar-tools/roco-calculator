# S1–S3 赛季背景生成记录

可复用方法见 [design.md](../../design.md)。本文只保存对应赛季的实际提示词，不作为未来赛季场景事实或强制模板。

2026-10-16，使用内置 imagegen。官方 PV 只作氛围与视觉依据；输出为计算器自制背景，不是官方场景图。精灵原图单独叠加，不参与生成。运行时等比导出为 WebP，保持 alpha 与图像内容。

## S1

Use case: stylized-concept. Create a NEW panoramic illustrated UI background asset for a fantasy game damage-calculator season skin inspired by S1 暗夜拾光. The attached official promotional cover is REFERENCE ONLY, not an edit target. Cool blue stone castle courtyard at night, still water with faint reflections, distant narrow pointed arches, violet blue shadow, a few tiny pale-gold magical glints. A quiet nocturnal discovery mood, NOT outer space, no planets, no lunar surface. Use the official cover only for architectural mood and palette. Our separate transparent dragon artwork will be placed later; do not paint any creature.
Style: restrained polished painterly 3D fantasy game environment, soft atmospheric depth, match the clean game art quality of the reference. Composition: very wide 3:1 panorama, ideally 2400x800. The asset is a background behind a 50px toolbar and a 240px page-top fade. Keep the middle horizontal band from 35% to 65% of height legible as an attractive narrow crop. Quiet negative space at the left 40% and far right 20% so text and controls can be overlaid. Visual motifs cluster around center-right 55–75%. Scene must extend naturally edge to edge, no frames or margins. No huge bright focal object. Do not create a UI mockup or add controls.
Absolutely NO text, no letters, no logo, no watermark, no title, no season numeral, no characters, no animals or creatures. Do not reproduce the reference's typography. Background only. This is an original fan-tool decorative scene, not official game art.


## S2

Use case: stylized-concept. Create a NEW panoramic illustrated UI background asset for a fantasy game damage-calculator season skin inspired by S2 狂欢怪谈. The attached official promotional cover is REFERENCE ONLY, not an edit target. Mysterious theatrical circus interior, deep plum and burgundy velvet curtains, muted red and ivory striped tent canopy, a very few warm amber bulbs on a graceful string, subtle antique brass stage trim. Playful magical stagecraft, not horror. Use the official cover only for circus architecture and palette. Our separate original mechanical ark creature will be placed later; do not paint any creature.
Style: restrained polished painterly 3D fantasy game environment, soft atmospheric depth, match the clean game art quality of the reference. Composition: very wide 3:1 panorama, ideally 2400x800. The asset is a background behind a 50px toolbar and a 240px page-top fade. Keep the middle horizontal band from 35% to 65% of height legible as an attractive narrow crop. Quiet negative space at the left 40% and far right 20% so text and controls can be overlaid. Visual motifs cluster around center-right 55–75%. Scene must extend naturally edge to edge, no frames or margins. No huge bright focal object. Do not create a UI mockup or add controls.
Absolutely NO text, no letters, no logo, no watermark, no title, no season numeral, no characters, no animals or creatures. Do not reproduce the reference's typography. Background only. This is an original fan-tool decorative scene, not official game art.


## S3

Use case: stylized-concept. Create a NEW panoramic illustrated UI background asset for a fantasy game damage-calculator season skin inspired by S3 铅字幻梦. The attached official promotional cover is REFERENCE ONLY, not an edit target. Dreamlike storybook publisher library, warm dim walnut bookshelves receding into soft shadow, a gentle curling magenta book page ribbon through the lower third, little folded paper fir-tree shapes toward the lower right and two small warm star glints. Deep ink-teal shadows with parchment amber and subtle berry accents. Use the official cover only for the library, paper world and palette. Our separate original Jiaer character will be placed later; do not paint any creature.
Style: restrained polished painterly 3D fantasy game environment, soft atmospheric depth, match the clean game art quality of the reference. Composition: very wide 3:1 panorama, ideally 2400x800. The asset is a background behind a 50px toolbar and a 240px page-top fade. Keep the middle horizontal band from 35% to 65% of height legible as an attractive narrow crop. Quiet negative space at the left 40% and far right 20% so text and controls can be overlaid. Visual motifs cluster around center-right 55–75%. Scene must extend naturally edge to edge, no frames or margins. No huge bright focal object. Do not create a UI mockup or add controls.
Absolutely NO text, no letters, no logo, no watermark, no title, no season numeral, no characters, no animals or creatures. Do not reproduce the reference's typography. Background only. This is an original fan-tool decorative scene, not official game art.

## S5 · 圣龙宝藏 · 2026-10-23

方式：Codex 内置 imagegen，单张背景；两张官方 PV 帧仅作为参考，非编辑目标。参考路径见 season-themes.md 第 7 节。原稿保存在 output/season-s5/s5-dragon-treasure-original.png，运行时文件为 public/assets/season/s5-dragon-treasure.webp；透明角色尚无可靠素材，未生成或重绘。

实际提示词：

```text
Use case: stylized-concept. Create ONE very wide 3:1 environment-only decorative background for the existing Roco Calculator season S5 theme. The attached images are visual references from the official S5 PV, not edit targets. Create an original derivative decoration inspired by the sunny toy amusement park, turquoise sea and sky, muted warm orange buildings and bronze mechanical toy architecture. It is not an exact game screenshot. Intended output about 2000x667. It must work as a 50px-tall header crop through the vertical middle and as a 240px-tall fading backdrop. Composition: left 40% quiet low-contrast distant turquoise sky/sea and soft foliage; middle-right 55%-75% a recognizable compact bronze mechanical dragon-head entrance/building arch inspired by reference 1, seen at a distance, with restrained warm coral toy architecture, small gear shapes and a few simple colored toy blocks; rightmost 20% quiet blue-green atmospheric distance. Main architectural forms in vertical 35%-65%, do not put main subject at top edge. Keep details and contrast controlled so UI text can overlay. Polished softly painterly 3D-game-inspired environment, warm amber accents, teal shadows. No characters, no creatures or living dragons, no humanoids or mascot, no UI, no words, no letters, no numerals, no logo, no watermark, no border, no black bars. Architectural dragon-head shape is an inanimate building. No purple night scene, no library, no excessive floating confetti. Do not copy the watermark or disclaimer from references.
```

导出：FFmpeg `scale=2000:667:force_original_aspect_ratio=increase,crop=2000:667`，WebP quality 84、compression_level 6。原稿 2172×724 RGB；已读回 WebP 确认 2000×667、无角色、无伪字或水印。
