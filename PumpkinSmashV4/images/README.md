# Reference images

Put your reference images (`.jpg`, `.jpeg`, `.png`, or `.webp`) in this folder.

After the first target build, `manifest.json` will list the exact filenames in this directory. The target builder can use that list to load the hosted images automatically. If you add or remove source images, update the list (or select the local files in the builder), then rebuild `targets.mind` and `target-manifest.json`.

Image-target tracking recognizes the actual flat image and tracks its pose. It does not classify a real 3D object that merely looks similar to the reference image. For best results use sharp, textured, non-repetitive images.
