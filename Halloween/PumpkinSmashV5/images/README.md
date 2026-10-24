# images/

The 51 original reference photographs, unmodified. **The order in `manifest.json` is the target index** in `targets.mind`
(`imageN.jpg` is index N-1), and each entry's `label` describes the photo.

| Index | Files | What they show |
|---|---|---|
| 0 | image1.jpg | Indoor: dresser, lamp, shelf of photos. |
| 1 | image2.jpg | Indoor: doodled beach ball on a tile floor. **Not detected** by the tracker (see ../README.md). |
| 2 | image3.jpg | Indoor: white double door with pumpkin wreath and garland. |
| 3–30 | image4.jpg – image31.jpg | Yard decorations in daylight: skeletons, TICKETS booth, fortune teller, toilet scene, dead trees, clown, strongman. |
| 31–41 | image32.jpg – image42.jpg | Yard decorations at night. |
| 42 | image43.jpg | Rooftop clown skeleton at night. |
| 43–49 | image44.jpg – image50.jpg | Indoor: arcade cabinet, bookshelf, mat, box, framed prints, FAMILY canvas. |
| 50 | image51.jpg | Yard in daylight: clown skeleton in a red toy car. |

Removed: two exact duplicates of image1/image3, and two near-identical night shots that the tracker kept mistaking for
their neighbours (the strongman and the kneeling skeleton, each photographed twice from almost the same spot).

## Tracking test results (simulated camera, not a real phone)

- **Straight on** (photo upright, filling most of the view): every photo except image2 is detected, mostly within 3–5 s,
  and the pumpkin lands within a few pixels of the photo's centre.
- **Harder view** (photo smaller, rotated 12° and tilted away): not detected within 90 s for image2, 3, 11, 29, 33, 34, 36
  and 46. Image6 is detected but the pumpkin sits off-centre. Image32 and image37 are slow (10–20 s). All others work.
  With these photos, hold the phone closer and square-on.
- The builder rates image1, image39 and image43 only "fair" (few distinctive features).

If you add, remove, reorder or replace a photo, rebuild `targets.mind` and `target-manifest.json` with `../target-builder.html`
and upload both. The game does not read these JPGs at runtime; only the builder does.
