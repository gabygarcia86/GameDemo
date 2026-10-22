import './vendor/mind-ar/dist/mindar-image.prod.js';

const targetFiles = ['image1.jpg', 'image2.jpg', 'image3.jpg', 'image4.jpg', 'image5.jpg'];
const $ = (id) => document.getElementById(id);
const list = $('target-list');
const buildButton = $('build-button');
const status = $('status');
const progressBar = $('progress-bar');
let loadedTargets = [];
let building = false;

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `status${kind ? ` ${kind}` : ''}`;
}

function addTargetCard(filename) {
  const card = document.createElement('article');
  card.className = 'target-card';
  const preview = document.createElement('img');
  preview.alt = '';
  preview.hidden = true;
  const details = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = filename;
  const dimensions = document.createElement('span');
  dimensions.textContent = 'Loading…';
  const error = document.createElement('span');
  error.className = 'target-error';
  error.hidden = true;
  details.append(name, dimensions, error);
  card.append(preview, details);
  list.append(card);
  return { card, preview, dimensions, error };
}

async function loadTarget(filename, card) {
  const response = await fetch(`./images/${filename}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Image decoding failed.'));
      image.src = objectUrl;
    });
    card.preview.src = objectUrl;
    card.preview.hidden = false;
    card.dimensions.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`;
    return { filename, image, width: image.naturalWidth, height: image.naturalHeight };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw new Error(`Image decode failed: ${error.message}`);
  }
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function loadSources() {
  const pending = targetFiles.map((filename) => {
    const card = addTargetCard(filename);
    return loadTarget(filename, card).then(
      (target) => ({ status: 'fulfilled', target }),
      (error) => {
        card.dimensions.textContent = 'Could not load';
        card.error.hidden = false;
        card.error.textContent = error.message;
        return { status: 'rejected', filename, error };
      }
    );
  });
  const results = await Promise.all(pending);
  loadedTargets = results.filter((result) => result.status === 'fulfilled').map((result) => result.target);
  if (loadedTargets.length === targetFiles.length) {
    setStatus(`All ${targetFiles.length} reference photos loaded. Ready to build.`);
  } else {
    setStatus(`${loadedTargets.length} of ${targetFiles.length} photos loaded. Fix the listed image errors before building.`, 'bad');
  }
  buildButton.disabled = loadedTargets.length !== targetFiles.length || !window.MINDAR?.IMAGE?.Compiler;
  if (!window.MINDAR?.IMAGE?.Compiler) {
    setStatus('The local MindAR image compiler did not load. Check that vendor/mind-ar files were uploaded, then reload.', 'bad');
  }
}

buildButton.addEventListener('click', async () => {
  if (building || loadedTargets.length !== targetFiles.length || !window.MINDAR?.IMAGE?.Compiler) return;
  building = true;
  buildButton.disabled = true;
  progressBar.style.width = '0%';
  setStatus('Preparing compiler…');
  try {
    const compiler = new window.MINDAR.IMAGE.Compiler();
    setStatus('Analyzing image features. Keep this page open; compilation can take a few minutes.');
    const compiledTargets = await compiler.compileImageTargets(loadedTargets.map((target) => target.image), (percentage) => {
      const progress = Math.max(0, Math.min(100, Number(percentage) || 0));
      progressBar.style.width = `${progress}%`;
      setStatus(`Compiling image targets… ${Math.round(progress)}%`);
    });
    if (!Array.isArray(compiledTargets) || compiledTargets.length !== targetFiles.length) {
      throw new Error(`MindAR compiled ${compiledTargets?.length || 0} targets instead of ${targetFiles.length}.`);
    }
    const binary = await compiler.exportData();
    if (!(binary instanceof Uint8Array) || binary.byteLength === 0) {
      throw new Error('MindAR returned an empty or invalid database.');
    }
    const targetManifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      trackingLibrary: 'MindAR Image Tracking 1.2.5',
      targetCount: loadedTargets.length,
      targets: loadedTargets.map((target, index) => ({
        index,
        filename: target.filename,
        width: target.width,
        height: target.height,
        aspectRatio: target.height / target.width
      }))
    };
    const json = new Blob([JSON.stringify(targetManifest, null, 2)], { type: 'application/json' });
    if (json.size === 0) throw new Error('The target manifest could not be generated.');
    download(new Blob([binary], { type: 'application/octet-stream' }), 'targets.mind');
    download(json, 'target-manifest.json');
    progressBar.style.width = '100%';
    setStatus('Build complete. Both files were generated. Place targets.mind and target-manifest.json beside index.html, then reload the game.', 'good');
  } catch (error) {
    console.error('MindAR image-target compilation failed:', error);
    setStatus(`Compilation failed: ${error.message || String(error)}. Check the image files and reload before trying again.`, 'bad');
  } finally {
    building = false;
    buildButton.disabled = loadedTargets.length !== targetFiles.length || !window.MINDAR?.IMAGE?.Compiler;
  }
});

loadSources().catch((error) => {
  console.error('Could not load reference photos:', error);
  setStatus(`Could not load the reference photos: ${error.message || String(error)}`, 'bad');
});
