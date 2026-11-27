# Art prompts

Every bitmap in `src/assets/` was generated from the prompt below with an image-generation model,
then resized and compressed by script. All art is original: no third-party characters, maps, logos or brands.

| File | Prompt |
| --- | --- |
| `key-art.jpg` | Wide 16:9 game title key art, stylised digital illustration with bold graphic shapes and clean edges. Top-down three-quarter view of a night-time city rooftop. A small metal smoke canister in the centre has just burst into a huge, billowing, bright white cloud of smoke with soft volumetric edges, lit by electric cyan-blue rim light. Five tiny blue-jacketed figures sprint along a painted lane in the foreground; two red scanning beams from sensor turrets sweep across the rooftop and are cut off by the smoke. Palette: deep navy and midnight blue, electric cyan, crisp white smoke, a few coral-red accents. Lots of empty dark space at the left third for a title to be added later. Energetic, premium esports-event feel. |
| `roof.jpg` | Seamless tileable top-down texture of a flat building rooftop seen from directly above, for a 2D game: dark slate-blue roofing membrane panels with thin seams, a few small square vents and pipe caps, subtle wear and grime, soft ambient light, no perspective. Colour range #1f3a68 to #2b4b80. Square 1024x1024. |
| `floor.jpg` | Seamless tileable top-down texture of a dark concrete plaza floor seen from directly above, for a 2D game background: large poured-concrete slabs with thin expansion joints, faint scuffs and weathering, a few small drains, low contrast. Colour range #0a1a36 to #14305a. Square 1024x1024. |
| `runner.png` | A single top-down game sprite of a small character seen from directly above, running, on a fully transparent background: rounded helmet, cyan-blue jacket with white shoulder stripes, small backpack, arms mid-swing. Clean vector-like illustration with a thin dark outline, readable at 40 pixels. |
| `smoke-a.png` | A single soft billowing puff of white game smoke seen from directly above, round overall shape with lumpy cauliflower-like edges and soft volumetric shading (bright white top-left, pale blue-grey shadow lower-right), wispy feathered rim fading to fully transparent. Centred on a fully transparent background. Stylised, clean, game-ready sprite. |
| `smoke-b.png` | A single small wisp cluster of white game smoke seen from directly above, irregular rounded blob with three or four soft lobes and gentle swirl, soft shading from bright white to pale blue-grey, feathered edges fading to fully transparent. Centred on a fully transparent background. Stylised game sprite. |

Every prompt also carried: "original artwork only; no text, letters, numbers, logos, watermarks, signatures or UI;
nothing resembling any existing game, brand or character."

## Sky-Deck art (27 Nov 2026)

The current look. Made with an image-generation model; style references first, then each asset with the gameplay
reference attached so they match. The deck floor tiles are drawn in code (`sandTileTexture` in `render3d.ts`); the
runners, camera pylons, glass edge, platforms and drones are built from simple 3D shapes in code.

| File | Prompt |
| --- | --- |
| (reference) | A gameplay frame from an original top-down 3D booth game, high broadcast camera about 50 degrees. A rectangular floating sky-deck arena hovers above a sea of bright clouds. Its floor is warm sand-grey concrete tiles with thin charcoal grid lines and a few painted floor markings. All around the edge runs a low clear glass barrier topped with a brushed aluminium rail; where a thrown canister has just hit the glass, a small cyan ripple ring glows. Inside: four matte slate cover blocks with bevelled edges and aluminium bumper strips. A painted sky-blue crossing lane with white chevrons runs between two blocks. Two sleek white-and-graphite camera pylons with a single lens each project sharp translucent signal-orange laser sheets across the lane. A puffy stylised low-poly smoke cloud, white with soft blue shading, sits in the lane and visibly cuts the orange sheets off. Five small white ceramic figurines with sky-blue trim crouch at the start of the lane. A dashed white arc shows the canister path banking off one block. Beyond the deck: two smaller floating platforms in the distance, one slow camera drone, and a hovering blank screen panel on a thin frame. Style: clean premium stylised 3D render, flat-shaded low-poly shapes with crisp bevels, soft global illumination, hard late-morning sun with soft contact shadows. Palette: warm off-white and sand-grey concrete, matte slate grey, brushed aluminium, sky blue accents, signal orange lasers, bright white clouds. |
| `key-art-skydeck.jpg` | Hero key art for the title screen of the same game as the reference image: a dramatic low three-quarter view across the sunlit floating sky-deck, a smoke cloud blooming in the middle of the crossing lane and slicing two orange laser sheets, five white ceramic figurines sprinting across the lane in formation with light motion streaks, bright sea of clouds and deep blue sky behind, sun flare. Keep the left third of the frame calmer and simpler (open sky and soft clouds) so a title can be placed there later. Same materials and palette as the reference. Style: clean premium stylised 3D render, flat-shaded low-poly shapes with crisp bevels, soft global illumination, hard late-morning sun with soft contact shadows. Palette: warm off-white and sand-grey concrete, matte slate grey, brushed aluminium, sky blue accents, signal orange lasers, bright white clouds. |
| `block-top.jpg` | A seamless tileable texture seen straight from above, perfectly flat and evenly lit with no perspective: the roof of a matte slate-grey cover block, subtle panel seams, two small inset vent grilles and a thin painted sky-blue edge line, matching the blocks in the reference image. Edges must tile seamlessly. |
| `sky.jpg / cloud-sea.jpg` | A wide panoramic backdrop with no deck in it: an endless sea of bright white and soft blue-shaded clouds under a clear deep sky blue, late-morning sun from the upper left, a few very distant small floating platforms and one tiny drone silhouette near the horizon. Calm, bright, airy, matching the sky in the reference image. |

Each prompt also carried:"Original artwork for an original game. No text, no letters, no numbers, no logos, no watermark, no signature, no user interface, no real people, no guns, nothing resembling any existing game, brand or character."

The night-rooftop files above (`key-art.jpg`, `roof.jpg`, `floor.jpg`, `runner.png`) belong to the earlier look and
are kept for the flat safe mode and the history.
