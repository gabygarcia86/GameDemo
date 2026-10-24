# images/

The 53 original reference photographs, unmodified. **The order in `manifest.json` is the target index** in `targets.mind`,
and each entry's `label` describes the photo.

`image46.jpg` and `image48.jpg` were exact duplicates of `image1.jpg` and `image3.jpg` and have been removed, so file numbers
skip them and no longer match the target index after image 45.

| Index | Files | What they show |
|---|---|---|
| 0 | image1.jpg | Indoor: dresser, lamp, shelf of photos. "Fair" target. Works. |
| 1 | image2.jpg | Indoor: doodled beach ball on a tile floor. **Not detected** by the tracker (see ../README.md). |
| 2 | image3.jpg | Indoor: white double door with pumpkin wreath and garland. Best target. |
| 3–30 | image4.jpg – image31.jpg | Yard decorations in daylight: skeletons, TICKETS booth, fortune teller, toilet scene, dead trees, clown, strongman. |
| 31–43 | image32.jpg – image44.jpg | Yard decorations at night. |
| 44 | image45.jpg | Rooftop clown skeleton at night. |
| 45–51 | image47.jpg, image49.jpg – image54.jpg | Indoor: arcade cabinet, bookshelf, mat, box, framed prints, FAMILY canvas. |
| 52 | image55.jpg | Yard in daylight: clown skeleton in a red toy car. |

Images 4–55 have not been tested for tracking yet. Photos with large plain walls or floors (for example image50, image51,
image54) are likely to be weak targets, like image 2.

If you add, remove, reorder or replace a photo, rebuild `targets.mind` and `target-manifest.json` with `../target-builder.html`
and upload both. The game does not read these JPGs at runtime; only the builder does.
