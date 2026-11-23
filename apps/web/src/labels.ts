import type { SkaterAttribute, GoalieAttribute, TraitId, Tactics, Position, ClubProfile } from '@ehm/schema';

export const POSITION_LABEL: Record<Position, string> = {
  C: 'Center', LW: 'Linksaußen', RW: 'Rechtsaußen', LD: 'Verteidiger links', RD: 'Verteidiger rechts', G: 'Torhüter',
};

export const PROFILE_LABEL: Record<ClubProfile, string> = {
  tradition: 'Traditionsverein', corporate: 'Konzernclub', patron: 'Mäzenclub', development: 'Ausbildungsverein', promoted: 'Aufsteiger',
};

export const SKATER_LABEL: Record<SkaterAttribute, string> = {
  skating: 'Skating', agility: 'Beweglichkeit', puckHandling: 'Puckführung', passing: 'Passen',
  shotPower: 'Schusskraft', shotAccuracy: 'Schussgenauigkeit', faceoffs: 'Bully',
  defPositioning: 'Def. Stellungsspiel', stickChecking: 'Stockcheck', bodyChecking: 'Körperspiel',
  shotBlocking: 'Schüsse blocken', strength: 'Stärke', stamina: 'Ausdauer',
  hockeyIQ: 'Spielintelligenz', anticipation: 'Antizipation', composure: 'Nervenstärke',
  discipline: 'Disziplin', workRate: 'Einsatz', leadership: 'Führung',
};

export const SKATER_GROUPS: { title: string; keys: SkaterAttribute[] }[] = [
  { title: 'Technik', keys: ['skating', 'agility', 'puckHandling', 'passing', 'shotPower', 'shotAccuracy', 'faceoffs'] },
  { title: 'Defensive & Physis', keys: ['defPositioning', 'stickChecking', 'bodyChecking', 'shotBlocking', 'strength', 'stamina'] },
  { title: 'Mental', keys: ['hockeyIQ', 'anticipation', 'composure', 'discipline', 'workRate', 'leadership'] },
];

export const GOALIE_LABEL: Record<GoalieAttribute, string> = {
  reflexes: 'Reflexe', positioning: 'Stellungsspiel', lowShots: 'Tiefe Schüsse', glove: 'Fanghand',
  blocker: 'Stockhand', reboundControl: 'Reboundkontrolle', puckPlaying: 'Puckspiel', agility: 'Beweglichkeit',
  concentration: 'Konzentration', composure: 'Nervenstärke',
};

export const TRAIT_LABEL: Record<TraitId, { name: string; text: string; tone: 'pos' | 'neg' | 'mix' }> = {
  leader: { name: 'Leader', text: 'Treibt sich und seine Reihe in engen Situationen an.', tone: 'pos' },
  mentor: { name: 'Mentor', text: 'Hilft jungen Spielern bei der Entwicklung.', tone: 'pos' },
  teamplayer: { name: 'Teamplayer', text: 'Baut schnell gute Beziehungen auf, akzeptiert kleinere Rollen.', tone: 'pos' },
  freigeist: { name: 'Freigeist', text: 'Kreativ im Angriff, verträgt keine strengen Trainer.', tone: 'mix' },
  hitzkopf: { name: 'Hitzkopf', text: 'Spielt hart, kassiert aber leichter Strafen.', tone: 'mix' },
  diva: { name: 'Diva', text: 'Reagiert empfindlich auf weniger Eiszeit.', tone: 'neg' },
  egoist: { name: 'Egoist', text: 'Schießt lieber selbst, als zu passen.', tone: 'mix' },
  stillerArbeiter: { name: 'Stiller Arbeiter', text: 'Konstant und unaufgeregt.', tone: 'pos' },
  kabinenclown: { name: 'Kabinenclown', text: 'Hebt die Stimmung nach Niederlagen.', tone: 'mix' },
  perfektionist: { name: 'Perfektionist', text: 'Entwickelt sich schnell, hadert mit Fehlern.', tone: 'mix' },
  bigGame: { name: 'Big-Game-Spieler', text: 'Stark in Playoffs, Verlängerung und Derbys.', tone: 'pos' },
  nervenbuendel: { name: 'Nervenbündel', text: 'Schwächelt, wenn es darauf ankommt.', tone: 'neg' },
  kaempfer: { name: 'Kämpfer', text: 'Legt bei Rückstand zu.', tone: 'pos' },
  schoenwetter: { name: 'Schönwetterspieler', text: 'Gut bei Führung, schwach bei Rückstand.', tone: 'mix' },
  heimstark: { name: 'Heimstark', text: 'Spielt zu Hause besser.', tone: 'mix' },
  disziplinfanatiker: { name: 'Disziplinfanatiker', text: 'Weniger Strafen, Reibung mit Freigeistern.', tone: 'mix' },
  spielerversteher: { name: 'Spielerversteher', text: 'Stabilisiert die Moral.', tone: 'pos' },
  motivator: { name: 'Motivator', text: 'Hebt das Teamklima.', tone: 'pos' },
  ausbilder: { name: 'Ausbilder', text: 'Fördert junge Spieler.', tone: 'pos' },
  taktikfuchs: { name: 'Taktikfuchs', text: 'Neue Systeme sitzen schneller.', tone: 'pos' },
};

type Opt<K extends keyof Tactics> = { value: Tactics[K]; label: string; hint: string }[];

export const TACTIC_OPTIONS: { [K in keyof Tactics]: { title: string; options: Opt<K> } } = {
  forecheck: {
    title: 'Forecheck-System',
    options: [
      { value: '1-2-2', label: '1-2-2', hint: 'Konservativ: wenig Konter gegen dich, aber weniger Puckgewinne vorne.' },
      { value: '2-1-2', label: '2-1-2', hint: 'Aggressiv: viele Puckgewinne im Angriffsdrittel, aber konteranfällig.' },
      { value: 'leftWingLock', label: 'Left Wing Lock', hint: 'Sicher: Flügel sichert ab, bremst gegnerische Eintritte.' },
      { value: '1-3-1', label: '1-3-1 Trap', hint: 'Mitte zustellen: erschwert Zoneneintritte, lässt Aufbau zu.' },
    ],
  },
  forecheckIntensity: {
    title: 'Forecheck-Intensität',
    options: [
      { value: 'passive', label: 'Passiv', hint: 'Spart Kraft, weniger Druck.' },
      { value: 'normal', label: 'Normal', hint: 'Ausgewogen.' },
      { value: 'aggressive', label: 'Aggressiv', hint: 'Mehr Druck und Puckgewinne, mehr Ermüdung und Strafen.' },
    ],
  },
  breakout: {
    title: 'Spielaufbau (Breakout)',
    options: [
      { value: 'short', label: 'Kurzpass über Center', hint: 'Standard, ausgewogen.' },
      { value: 'd2d', label: 'D-zu-D / Reverse', hint: 'Gut gegen aggressives Forechecking.' },
      { value: 'boards', label: 'Über die Bande', hint: 'Sicher, aber oft nur Befreiung statt sauberem Aufbau.' },
      { value: 'stretch', label: 'Stretch-Pass', hint: 'Riskant: mehr Konter, aber mehr Puckverluste.' },
      { value: 'carry', label: 'Verteidiger läuft selbst', hint: 'Lohnt sich mit schnellen Verteidigern.' },
    ],
  },
  entry: {
    title: 'Zoneneintritt',
    options: [
      { value: 'auto', label: 'Je nach Lage', hint: 'Spieler entscheiden selbst.' },
      { value: 'controlled', label: 'Kontrolliert reintragen', hint: 'Bessere Chancen, mehr Puckverluste an der Linie.' },
      { value: 'dump', label: 'Dump & Chase', hint: 'Sicher, lebt von Einsatz und Körperspiel.' },
    ],
  },
  offensiveZone: {
    title: 'Angriffsspiel',
    options: [
      { value: 'cycle', label: 'Cycle / Bandenspiel', hint: 'Puck halten, Geduld.' },
      { value: 'point', label: 'Schüsse von der Blauen Linie', hint: 'Viele Schüsse, oft geblockt.' },
      { value: 'slot', label: 'Slot-Spiel', hint: 'Gefährliche Chancen, aber mehr Puckverluste.' },
      { value: 'netFront', label: 'Netzfront / Verkehr', hint: 'Sichtbehinderung und Rebounds.' },
    ],
  },
  defensiveZone: {
    title: 'Defensive',
    options: [
      { value: 'zone', label: 'Zonendeckung', hint: 'Solide Standardvariante.' },
      { value: 'man', label: 'Mann-gegen-Mann', hint: 'Enger am Gegner, Slot gefährdeter bei Fehlern.' },
      { value: 'swarm', label: 'Schwarm am Puck', hint: 'Viele Puckgewinne, Blaue Linie bleibt offen.' },
    ],
  },
  gap: {
    title: 'Abstand neutrale Zone',
    options: [
      { value: 'tight', label: 'Eng', hint: 'Stoppt Eintritte früh, Gefahr überlaufen zu werden.' },
      { value: 'medium', label: 'Mittel', hint: 'Ausgewogen.' },
      { value: 'loose', label: 'Weit', hint: 'Kein Überlaufen, aber Gegner kommt leichter rein.' },
    ],
  },
  tempo: {
    title: 'Tempo',
    options: [
      { value: 'slow', label: 'Ruhig', hint: 'Weniger Chancen, spart Kraft.' },
      { value: 'normal', label: 'Normal', hint: 'Ausgewogen.' },
      { value: 'high', label: 'Hoch', hint: 'Mehr Chancen auf beiden Seiten, kürzere Wechsel.' },
    ],
  },
  physicality: {
    title: 'Härte',
    options: [
      { value: 'fair', label: 'Fair', hint: 'Wenig Strafen, weniger Zweikampfstärke.' },
      { value: 'normal', label: 'Normal', hint: 'Ausgewogen.' },
      { value: 'hard', label: 'Hart', hint: 'Mehr Checks, deutlich mehr Strafen.' },
    ],
  },
};

export const NATION_LABEL: Record<string, string> = {
  DE: 'Deutschland', CA: 'Kanada', US: 'USA', SE: 'Schweden', FI: 'Finnland', CZ: 'Tschechien',
  SK: 'Slowakei', LV: 'Lettland', AT: 'Österreich',
};

export const euro = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
export const mmss = (sec: number) => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const pct = (x: number) => `${Math.round(x * 100)} %`;
