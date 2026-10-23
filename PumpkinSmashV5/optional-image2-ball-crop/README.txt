Optional replacement for image 2.

The full image2.jpg (small play ball on a plain wall and repeating floor tiles) is NOT detected by the tracker.
This folder holds a 630x630 crop of your own photo around the ball, plus a matching database. In a test (synthetic camera
clip) the crop was detected after ~7 seconds and tracked in 95 of 104 samples.

To use it, copy over the project's files:
  images/image2.jpg          ->  images/image2.jpg          (keep your original as images/image2-original.jpg first)
  targets.mind               ->  targets.mind
  target-manifest.json       ->  target-manifest.json
Then point the camera at the cropped picture. The three files must go in together.
