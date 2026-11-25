import type { World, CoachingRule, RuleCondition, RuleAction, Tactics } from '@ehm/schema';
import { toDisplay } from './ratings.ts';

/**
 * Coaching-Regeln: Wenn-Dann-Anweisungen, die während des Spiels bei Unterbrechungen geprüft werden.
 * Anzahl der Regelplätze und Reaktionszeit hängen vom Trainerteam ab.
 */

export const RULE_TEMPLATES: CoachingRule[] = [
  {
    id: 'tpl-empty-net', name: 'Torhüter raus', enabled: true,
    conditions: [{ type: 'score', state: 'trailing', min: 1, max: 2 }, { type: 'lastMinutes', minutes: 1.5 }, { type: 'period', period: '3' }],
    actions: [{ type: 'pullGoalie' }],
  },
  {
    id: 'tpl-protect', name: 'Führung sichern', enabled: true,
    conditions: [{ type: 'score', state: 'leading', min: 1, max: 2 }, { type: 'time', fromMinute: 50 }],
    actions: [{ type: 'tactic', key: 'forecheck', value: '1-3-1' }, { type: 'tactic', key: 'tempo', value: 'slow' }, { type: 'tactic', key: 'entry', value: 'dump' }],
  },
  {
    id: 'tpl-crowbar', name: 'Brechstange', enabled: true,
    conditions: [{ type: 'score', state: 'trailing', min: 1, max: 3 }, { type: 'time', fromMinute: 45 }],
    actions: [{ type: 'tactic', key: 'forecheck', value: '2-1-2' }, { type: 'tactic', key: 'forecheckIntensity', value: 'aggressive' }, { type: 'tactic', key: 'tempo', value: 'high' }, { type: 'topLines' }],
  },
  {
    id: 'tpl-goalie', name: 'Torhüterwechsel bei schwacher Leistung', enabled: false,
    conditions: [{ type: 'goalieSave', below: 82, minShots: 15 }, { type: 'period', period: '2' }],
    actions: [{ type: 'switchGoalie' }],
  },
  {
    id: 'tpl-timeout', name: 'Auszeit nach Gegentor-Serie', enabled: false,
    conditions: [{ type: 'goalsAgainst', goals: 2, withinMinutes: 5 }],
    actions: [{ type: 'timeout' }],
  },
  {
    id: 'tpl-hothead', name: 'Hitzkopf auf die Bank', enabled: false,
    conditions: [{ type: 'playerPenalties', count: 2 }],
    actions: [{ type: 'benchPenalized' }],
  },
  {
    id: 'tpl-shortbench', name: 'Kurze Bank im Schlussdrittel', enabled: false,
    conditions: [{ type: 'period', period: '3' }, { type: 'score', state: 'tied', min: 1, max: 1 }],
    actions: [{ type: 'shortBench' }],
  },
  {
    id: 'tpl-playoff-matchups', name: 'Matchups in den Playoffs', enabled: false,
    conditions: [{ type: 'playoffs' }],
    actions: [{ type: 'matchups', on: true }],
  },
];

export function defaultRules(): CoachingRule[] {
  return RULE_TEMPLATES.filter((r) => r.enabled).map((r) => structuredClone(r));
}

export interface CoachingCapacity {
  slots: number;
  /** true = Regeln greifen bei der nächsten Unterbrechung, false = eine Unterbrechung später */
  fastReaction: boolean;
  /** Erfolgsquote-Bonus für Matchups (−0,1 … +0,1) */
  matchupSkill: number;
  explanation: string[];
}

/** Regelplätze und Reaktionszeit aus dem Trainerteam eines Vereins */
export function coachingCapacity(world: World, clubId: string): CoachingCapacity {
  const staff = world.staff.filter((s) => s.contract?.clubId === clubId);
  const head = staff.find((s) => s.role === 'headCoach');
  const assistant = staff.find((s) => s.role === 'assistantCoach');
  const d = head ? toDisplay(head.ratings.tactics) : 6;
  let slots = d >= 15 ? 10 : d >= 12 ? 8 : d >= 9 ? 6 : 4;
  const explanation = [`Cheftrainer Taktik ${d}: ${slots} Plätze`];
  if (assistant && toDisplay(assistant.ratings.tactics) >= 12) { slots += 1; explanation.push(`starker Co-Trainer: +1`); }
  if (staff.some((s) => s.traits.some((t) => t.id === 'taktikfuchs'))) { slots += 1; explanation.push('Taktikfuchs im Trainerteam: +1'); }
  return { slots, fastReaction: d >= 12, matchupSkill: (d - 10) / 60, explanation };
}

// ---------------------------------------------------------------- Beschreibungen

const TACTIC_VALUE_LABEL: Record<string, string> = {
  '1-2-2': '1-2-2', '2-1-2': '2-1-2', leftWingLock: 'Left Wing Lock', '1-3-1': '1-3-1 Trap',
  passive: 'passiv', normal: 'normal', aggressive: 'aggressiv',
  short: 'Kurzpass', d2d: 'D-zu-D', boards: 'über die Bande', stretch: 'Stretch-Pass', carry: 'Verteidiger läuft',
  controlled: 'kontrolliert', dump: 'Dump & Chase', auto: 'je nach Lage',
  cycle: 'Cycle', point: 'Schüsse von der Blauen', slot: 'Slot-Spiel', netFront: 'Netzfront',
  zone: 'Zone', man: 'Mann-gegen-Mann', swarm: 'Schwarm',
  tight: 'eng', medium: 'mittel', loose: 'weit', slow: 'ruhig', high: 'hoch', fair: 'fair', hard: 'hart',
};
export const TACTIC_KEY_LABEL: Record<keyof Tactics, string> = {
  forecheck: 'Forecheck', forecheckIntensity: 'Forecheck-Intensität', breakout: 'Spielaufbau', entry: 'Zoneneintritt',
  offensiveZone: 'Angriffsspiel', defensiveZone: 'Defensive', gap: 'Abstand neutrale Zone', tempo: 'Tempo', physicality: 'Härte',
};
export const tacticValueLabel = (v: string) => TACTIC_VALUE_LABEL[v] ?? v;

export function describeCondition(c: RuleCondition): string {
  switch (c.type) {
    case 'score':
      if (c.state === 'tied') return 'Gleichstand';
      return `${c.state === 'leading' ? 'Führung' : 'Rückstand'} mit ${c.min === c.max ? c.min : `${c.min}–${c.max}`} ${c.max === 1 ? 'Tor' : 'Toren'}`;
    case 'time': return `ab der ${c.fromMinute}. Minute`;
    case 'lastMinutes': return `in den letzten ${String(c.minutes).replace('.', ',')} Minuten`;
    case 'period': return c.period === 'OT' ? 'in der Verlängerung' : `im ${c.period}. Drittel`;
    case 'situation': return c.situation === 'EV' ? 'bei gleicher Spieleranzahl' : c.situation === 'PP' ? 'in Überzahl' : 'in Unterzahl';
    case 'shots': return `Schüsse ${c.state === 'behind' ? 'hinten' : 'vorne'} mit mind. ${c.diff}`;
    case 'goalieSave': return `Fangquote unter ${c.below} % (ab ${c.minShots} Schüssen)`;
    case 'goalsAgainst': return `${c.goals} Gegentore innerhalb von ${c.withinMinutes} Minuten`;
    case 'playerPenalties': return `ein Spieler hat ${c.count} Strafen`;
    case 'playoffs': return 'in den Playoffs';
  }
}

export function describeAction(a: RuleAction): string {
  switch (a.type) {
    case 'tactic': return `${TACTIC_KEY_LABEL[a.key as keyof Tactics]}: ${tacticValueLabel(a.value)}`;
    case 'shortBench': return 'nur noch 3 Sturmreihen';
    case 'topLines': return 'Topreihen öfter aufs Eis';
    case 'pullGoalie': return 'Torhüter raus (6 Feldspieler)';
    case 'switchGoalie': return 'Torhüter wechseln';
    case 'timeout': return 'Auszeit nehmen';
    case 'benchPenalized': return 'Spieler auf die Bank setzen';
    case 'matchups': return a.on ? 'Matchups aktivieren' : 'Matchups aussetzen';
  }
}

export const ONCE_ACTIONS: RuleAction['type'][] = ['switchGoalie', 'timeout'];
