# Lightweight added accessories

The original wardrobe drawing functions remain unchanged. Extra, League and
Overwatch accessories now use a maximum of 20 small solid surfaces per item,
instead of tessellated meshes and an image cache that churned during movement.
Surface definitions are shared between frames. Thickness, shaded side walls,
material gradients and contact shadows provide depth without tiny ornaments.
Hair caps use six broad dome panels around the entire head. Headbands use eight
large segments; ear linings are recessed into open shells, leaves have a raised
fold and rounded pieces use dome lighting. Kiriko's mask has three curved panels
and a complete band, including the rear half. These are fitted structural surfaces,
not additional ornaments; the same 20-surface budget remains enforced by tests.
Colour variants tint materials directly instead of running a Canvas filter for
every surface. The blue witch hat still uses the original witch-hat drawing.

Projection follows the eyes' head rotation. Rear pieces are drawn before the
body; front pieces are clipped against its curved depth surface. Face paint
sits just outside that surface. Goggles have open rims and translucent lenses,
so Mochi's own animated eyes remain visible. Existing Genji selections migrate
to Junkrat, including their saved colour style.

Visual references researched for the six Overwatch designs (no image assets copied):

| Item | Reference |
| --- | --- |
| Kiriko: raised fox mask and red cheek marks | [Character portrait](https://www.nexusmods.com/starwarsbattlefront22017/mods/13386) |
| Reinhardt: white beard and eye scar | [Portrait](https://wallpapercrafter.com/106038-digital-art-video-games-reinhardt-overwatch-men-scars-white-hair-beard-overwatch.html), [Blizzard cinematic](https://overwatch.blizzard.com/media/video/reinhardt-animated-short) |
| D.Va: pink headset and paired cheek marks | [Portrait](https://over-hub.com/articles/2025-04-02/) |
| Mercy: gold headpiece and white/gold mechanical wings | [Wing construction reference](https://www.cestlasara.com/2019/04/26/cosplay-wing-harness-tutorial/) |
| Junkrat: goggles and three grenade charms | [Official hero page](https://ow.blizzard.cn/heroes/junkrat/) |
| Tracer: orange goggles worn over the eyes | [Official promotional artwork](https://esports.overwatch.com/?category=OverwatchMVP) |
