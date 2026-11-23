import type { MatchEvent, Side } from '@ehm/core';

export interface LiveTeam {
  goals: number;
  sog: number;
  attempts: number;
  xg: number;
  blocked: number;
  missed: number;
  pp: number;
  ppg: number;
  pim: number;
  faceoffs: number;
  hits: number;
  breakouts: number;
  breakoutsClean: number;
  entryCtl: number;
  entryCtlOk: number;
  dumps: number;
  dumpsOk: number;
  giveaways: number;
  takeaways: number;
}

export interface LiveUnit { cf: number; ca: number; xgf: number; xga: number; gf: number; ga: number }
export interface LivePlayer { g: number; a: number; sog: number; att: number; hits: number; pim: number; xg: number }

const team = (): LiveTeam => ({
  goals: 0, sog: 0, attempts: 0, xg: 0, blocked: 0, missed: 0, pp: 0, ppg: 0, pim: 0, faceoffs: 0, hits: 0,
  breakouts: 0, breakoutsClean: 0, entryCtl: 0, entryCtlOk: 0, dumps: 0, dumpsOk: 0, giveaways: 0, takeaways: 0,
});
const unit = (): LiveUnit => ({ cf: 0, ca: 0, xgf: 0, xga: 0, gf: 0, ga: 0 });

export interface Live {
  teams: [LiveTeam, LiveTeam];
  lines: [LiveUnit[], LiveUnit[]];
  pairs: [LiveUnit[], LiveUnit[]];
  players: Map<string, LivePlayer>;
}

/** Statistiken aus den Ereignissen bis zum aktuellen Zeitpunkt berechnen. */
export function computeLive(events: MatchEvent[], upto: number): Live {
  const L: Live = {
    teams: [team(), team()],
    lines: [[0, 1, 2, 3].map(unit), [0, 1, 2, 3].map(unit)],
    pairs: [[0, 1, 2].map(unit), [0, 1, 2].map(unit)],
    players: new Map(),
  };
  const pl = (id: string | undefined) => {
    if (!id) return null;
    let p = L.players.get(id);
    if (!p) { p = { g: 0, a: 0, sog: 0, att: 0, hits: 0, pim: 0, xg: 0 }; L.players.set(id, p); }
    return p;
  };
  for (let i = 0; i < upto && i < events.length; i++) {
    const e = events[i];
    const T = L.teams[e.team], O = L.teams[1 - e.team];
    const players = e.players ?? {};
    switch (e.type) {
      case 'shot':
      case 'goal': {
        T.attempts++;
        T.xg += e.xg ?? 0;
        const shooter = pl(players.shooter ?? players.scorer);
        if (shooter) { shooter.att++; shooter.xg += e.xg ?? 0; }
        if (e.type === 'goal') {
          T.goals++; T.sog++;
          if (shooter) { shooter.g++; shooter.sog++; }
          const a1 = pl(players.assist1), a2 = pl(players.assist2);
          if (a1) a1.a++;
          if (a2) a2.a++;
          if (e.result === 'PP') T.ppg++;
        } else if (e.result === 'saved') { T.sog++; if (shooter) shooter.sog++; }
        else if (e.result === 'blocked') T.blocked++;
        else if (e.result === 'missed') T.missed++;
        const isGoal = e.type === 'goal' ? 1 : 0;
        if (e.line != null) { const u = L.lines[e.team][e.line]; u.cf++; u.xgf += e.xg ?? 0; u.gf += isGoal; }
        if (e.pair != null) { const u = L.pairs[e.team][e.pair]; u.cf++; u.xgf += e.xg ?? 0; u.gf += isGoal; }
        const opp = (1 - e.team) as Side;
        if (e.oppLine != null) { const u = L.lines[opp][e.oppLine]; u.ca++; u.xga += e.xg ?? 0; u.ga += isGoal; }
        if (e.oppPair != null) { const u = L.pairs[opp][e.oppPair]; u.ca++; u.xga += e.xg ?? 0; u.ga += isGoal; }
        break;
      }
      case 'penalty': {
        T.pim += 2; O.pp++;
        const p = pl(players.player); if (p) p.pim += 2;
        break;
      }
      case 'faceoff': T.faceoffs++; break;
      case 'hit': { T.hits++; const p = pl(players.hitter); if (p) p.hits++; break; }
      case 'breakout':
        T.breakouts++;
        if (e.result === 'clean') T.breakoutsClean++;
        if (e.result === 'turnover') { T.giveaways++; O.takeaways++; }
        break;
      case 'entry':
        if (e.result === 'controlled' || e.result === 'rush') { T.entryCtl++; T.entryCtlOk++; }
        if (e.result === 'turnover') { T.entryCtl++; T.giveaways++; O.takeaways++; }
        if (e.result === 'offside') T.entryCtl++;
        if (e.result === 'dumpRecovered') { T.dumps++; T.dumpsOk++; }
        if (e.result === 'dumpLost') T.dumps++;
        break;
      case 'turnover': T.giveaways++; O.takeaways++; break;
    }
  }
  return L;
}

/** Index des ersten Ereignisses nach Zeitpunkt t (binäre Suche). */
export function cutIndex<T extends { t: number }>(list: T[], t: number): number {
  let lo = 0, hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].t <= t) lo = mid + 1; else hi = mid;
  }
  return lo;
}
