class PoopStorm {
  constructor(layer) {
    this.layer = layer;
    this.timer = null;
    this.stopTimer = null;
    this.particleTimers = new Map();
  }

  spawnParticle() {
    const poop = document.createElement("span");
    poop.className = "poop-particle";
    poop.textContent = "💩";
    poop.style.left = `${Math.random() * 96}%`;
    poop.style.setProperty(
      "--poop-size",
      `${(Math.random() * 1.7 + 1.5).toFixed(2)}rem`,
    );
    poop.style.setProperty(
      "--poop-duration",
      `${(Math.random() * 3 + 4.3).toFixed(2)}s`,
    );
    poop.style.setProperty(
      "--poop-drift",
      `${Math.floor(Math.random() * 181) - 90}px`,
    );

    this.layer.appendChild(poop);
    poop.addEventListener("animationend", (event) => {
      if (event.animationName === "poopFall") this.removeParticle(poop);
    });
    const particleTimer = setTimeout(() => {
      this.particleTimers.delete(poop);
      poop.remove();
    }, 10000);
    this.particleTimers.set(poop, particleTimer);
  }

  removeParticle(poop) {
    poop.remove();
    const particleTimer = this.particleTimers.get(poop);
    if (particleTimer !== undefined) {
      clearTimeout(particleTimer);
      this.particleTimers.delete(poop);
    }
  }

  start(duration = null) {
    this.stop();
    this.spawnParticle();
    this.timer = setInterval(() => this.spawnParticle(), 260);
    if (duration !== null) {
      this.stopTimer = setTimeout(() => {
        clearInterval(this.timer);
        this.timer = null;
        this.stopTimer = null;
      }, duration);
    }
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    for (const particleTimer of this.particleTimers.values()) {
      clearTimeout(particleTimer);
    }
    this.particleTimers.clear();
    this.layer.replaceChildren();
  }
}
