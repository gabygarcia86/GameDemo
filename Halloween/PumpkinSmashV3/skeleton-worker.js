// Pumpkin Smash! AI skeleton detection worker.
// Heavy model loading and ONNX inference run off the page's main thread so the
// Three.js animation loop and touch controls remain responsive.
let detector = null;
let transformerModule = null;
let detectorLoading = false;
let scanBusy = false;

self.addEventListener('message', async (event) => {
  const message = event.data || {};

  if (message.type === 'init') {
    if (detector) {
      self.postMessage({ type: 'ready' });
      return;
    }
    if (detectorLoading) return;
    detectorLoading = true;
    self.postMessage({ type: 'loading', message: 'Loading AI model in a background worker. This may take a while on the first run.' });
    try {
      transformerModule = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2');
      transformerModule.env.allowLocalModels = false;
      transformerModule.env.useBrowserCache = true;
      detector = await transformerModule.pipeline(
        'zero-shot-object-detection',
        'onnx-community/grounding-dino-tiny-ONNX',
        { dtype: 'q4' }
      );
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({
        type: 'init-error',
        message: String(error?.message || error || 'The AI model failed to load.')
      });
    } finally {
      detectorLoading = false;
    }
    return;
  }

  if (message.type === 'scan') {
    if (!detector || scanBusy) return;
    scanBusy = true;
    try {
      const image = new transformerModule.RawImage(
        new Uint8ClampedArray(message.pixels), message.width, message.height, 4
      );
      const results = await detector(image, ['skeleton.'], { threshold: 0.15 });
      const detections = (Array.isArray(results) ? results : []).map(item => ({
        label: String(item.label || ''),
        score: Number(item.score || 0),
        box: {
          xmin: Number(item.box?.xmin || 0),
          ymin: Number(item.box?.ymin || 0),
          xmax: Number(item.box?.xmax || 0),
          ymax: Number(item.box?.ymax || 0)
        }
      }));
      self.postMessage({ type: 'detections', scanId: message.scanId, detections, width: message.width, height: message.height });
    } catch (error) {
      self.postMessage({ type: 'scan-error', message: String(error?.message || error || 'Inference failed.') });
    } finally {
      scanBusy = false;
    }
  }
});

