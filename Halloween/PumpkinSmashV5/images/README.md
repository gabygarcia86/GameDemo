# images/

The three original reference photographs, unmodified. **The order in `manifest.json` is the target index** in `targets.mind`.

| Index | File | Notes |
|---|---|---|
| 0 | image1.jpg | Dark cabinet, lamp, shelf of photos. "Fair" target. Works. |
| 1 | image2.jpg | Hand-coloured play ball on a tile floor. **Not detected** by the tracker (see ../README.md). |
| 2 | image3.jpg | White double door with pumpkin wreath and garland. Best target. |

If you add, remove, reorder or replace a photo, rebuild `targets.mind` and `target-manifest.json` with `../target-builder.html`
and upload both. The game does not read these JPGs at runtime; only the builder does.
