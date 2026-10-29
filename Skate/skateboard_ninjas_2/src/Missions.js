// Missions (three at a time, saved between runs) and the per-environment
// challenge shown when a run starts. Completing either pays out coins at the
// end of the run. Missions get harder as you complete more of them.

const POOL = [
  { id: 'coins', stat: 'coins', text: (n) => `Collect ${n} coins in one run`, targets: [50, 100, 200, 350] },
  { id: 'distance', stat: 'distance', text: (n) => `Ride ${n} m in one run`, targets: [500, 1000, 2000, 3500] },
  { id: 'karens', stat: 'karens', text: (n) => `Knock out ${n} Karens in one run`, targets: [3, 6, 10, 15] },
  { id: 'ninjas', stat: 'ninjas', text: (n) => `Defeat ${n} evil ninjas in one run`, targets: [2, 5, 8, 12] },
  { id: 'jumps', stat: 'jumpOvers', text: (n) => `Jump over ${n} obstacles in one run`, targets: [8, 18, 30, 45] },
  { id: 'slides', stat: 'slideUnders', text: (n) => `Slide under ${n} obstacles in one run`, targets: [4, 9, 16, 25] },
  { id: 'grind', stat: 'grind', text: (n) => `Grind rails for ${n} seconds in one run`, targets: [4, 10, 20, 32] },
  { id: 'ramps', stat: 'ramps', text: (n) => `Launch off ${n} ramps in one run`, targets: [2, 4, 7, 10] },
  { id: 'tricks', stat: 'tricks', text: (n) => `Land ${n} air tricks in one run`, targets: [3, 7, 12, 20] },
  { id: 'near', stat: 'nearMisses', text: (n) => `Pull off ${n} near misses in one run`, targets: [3, 7, 12, 20] },
  { id: 'mult', stat: 'maxMult', text: (n) => `Reach a x${n} multiplier`, targets: [2, 3, 4, 5] },
  { id: 'score', stat: 'score', text: (n) => `Score ${n.toLocaleString('en-US')} points in one run`, targets: [5000, 15000, 40000, 90000] },
  { id: 'kosTotal', stat: 'kos', total: true, text: (n) => `Knock out ${n} enemies in total`, targets: [20, 50, 100, 200] },
  { id: 'coinsTotal', stat: 'coins', total: true, text: (n) => `Collect ${n} coins in total`, targets: [300, 800, 2000, 5000] },
];

const byId = new Map(POOL.map((m) => [m.id, m]));
export const CHALLENGE_REWARD = 75;

export class Missions {
  constructor(save) {
    this.save = save;
    this.ensure();
  }

  get list() {
    return this.save.data.missions;
  }

  tier() {
    return Math.min(3, Math.floor((this.save.stats.missions || 0) / 4));
  }

  makeMission(exclude) {
    const options = POOL.filter((m) => !exclude.includes(m.id));
    const def = options[Math.floor(Math.random() * options.length)];
    const tier = Math.min(def.targets.length - 1, this.tier() + (Math.random() < 0.3 ? 1 : 0));
    return { id: def.id, target: def.targets[tier], progress: 0, reward: 50 + tier * 40 };
  }

  ensure() {
    const list = this.save.data.missions.filter((m) => byId.has(m.id));
    while (list.length < 3) list.push(this.makeMission(list.map((m) => m.id)));
    this.save.data.missions = list;
  }

  describe(m) {
    return byId.get(m.id)?.text(m.target) ?? '';
  }

  // Progress shown on the menu (totals include saved progress).
  progressOf(m, runScoring = null) {
    const def = byId.get(m.id);
    const run = runScoring ? runScoring.value(def.stat) : 0;
    return def.total ? m.progress + run : run;
  }

  // ---- during a run

  // Missions plus the level challenge, with progress including this run.
  runStatus(scoring) {
    const items = this.list.map((m) => ({
      text: this.describe(m), reward: m.reward, target: m.target,
      progress: this.progressOf(m, scoring), done: this.done?.has(m),
    }));
    const c = this.challenge;
    if (c) items.push({ text: c.text, reward: CHALLENGE_REWARD, target: c.target, progress: scoring.value(c.stat), done: this.challengeDone, challenge: true });
    return items;
  }

  begin(env) {
    this.done = new Set();
    this.challenge = env.challenge;
    this.challengeDone = false;
    this.newlyDone = [];
  }

  // Returns a list of { text, reward } completed since the last check.
  check(scoring) {
    const out = [];
    for (const m of this.list) {
      if (this.done.has(m)) continue;
      if (this.progressOf(m, scoring) >= m.target) {
        this.done.add(m);
        out.push({ text: this.describe(m), reward: m.reward, mission: true });
      }
    }
    if (this.challenge && !this.challengeDone && scoring.value(this.challenge.stat) >= this.challenge.target) {
      this.challengeDone = true;
      out.push({ text: this.challenge.text, reward: CHALLENGE_REWARD, challenge: true });
    }
    return out;
  }

  // At the end of a run: bank totals, replace completed missions.
  finish(scoring) {
    let reward = 0;
    const completed = [];
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const def = byId.get(m.id);
      if (this.done.has(m)) {
        reward += m.reward;
        completed.push({ text: `Mission: ${this.describe(m)}`, reward: m.reward });
        this.save.stats.missions = (this.save.stats.missions || 0) + 1;
        list[i] = null;
      } else if (def.total) {
        m.progress += scoring.value(def.stat);
      }
    }
    const kept = list.filter(Boolean);
    while (kept.length < 3) kept.push(this.makeMission(kept.map((m) => m.id)));
    this.save.data.missions = kept;
    if (this.challengeDone) {
      reward += CHALLENGE_REWARD;
      completed.push({ text: `Challenge: ${this.challenge.text}`, reward: CHALLENGE_REWARD });
      this.save.stats.challenges = (this.save.stats.challenges || 0) + 1;
    }
    return { reward, completed };
  }
}
