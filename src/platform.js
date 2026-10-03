// Platform hooks. Uses the CrazyGames SDK v3 when its script is on the page,
// and does nothing anywhere else (plain web, artifact preview, other portals).

const noop = () => {};

export const platform = {
  name: 'web',
  sdk: null,
  ready: false,
  hooks: { onAdStart: noop, onAdEnd: noop },

  async init(hooks = {}) {
    Object.assign(this.hooks, hooks);
    const CG = typeof window !== 'undefined' && window.CrazyGames && window.CrazyGames.SDK;
    if (!CG) return false;
    try {
      await CG.init();
      this.sdk = CG;
      this.name = 'crazygames';
      this.ready = CG.environment !== 'disabled';
    } catch (e) {
      console.warn('CrazyGames SDK init failed', e);
      return false;
    }
    return this.ready;
  },

  _call(fn) { try { if (this.sdk) fn(this.sdk); } catch (_) { /* SDK calls must never break the game */ } },
  loadingStart() { this._call((s) => s.game.loadingStart()); },
  loadingStop() { this._call((s) => s.game.loadingStop()); },
  gameplayStart() { this._call((s) => s.game.gameplayStart()); },
  gameplayStop() { this._call((s) => s.game.gameplayStop()); },
  happy() { this._call((s) => s.game.happytime()); },

  // Midgame ad at a natural break. Always calls done(), with or without an ad.
  midgameAd(done) {
    if (!this.ready || !this.sdk) { done(); return; }
    let finished = false;
    const end = () => { if (finished) return; finished = true; this.hooks.onAdEnd(); done(); };
    try {
      this.sdk.ad.requestAd('midgame', {
        adStarted: () => this.hooks.onAdStart(),
        adFinished: end,
        adError: end,
      });
    } catch (_) { end(); }
  },

  // Save data: the SDK's data module syncs with the player's account when
  // they are signed in; otherwise plain localStorage.
  getItem(key) {
    try { if (this.sdk && this.sdk.data) { const v = this.sdk.data.getItem(key); if (v != null) return v; } } catch (_) { /* fall through */ }
    try { return localStorage.getItem(key); } catch (_) { return null; }
  },
  setItem(key, value) {
    try { if (this.sdk && this.sdk.data) this.sdk.data.setItem(key, value); } catch (_) { /* fall through */ }
    try { localStorage.setItem(key, value); } catch (_) { /* private mode */ }
  },
};
