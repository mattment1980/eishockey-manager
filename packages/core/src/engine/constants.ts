/**
 * Kalibrierungs-Parameter der Match-Engine.
 * Alle „Stellschrauben“ an einem Ort – werden per Massensimulation (sim-cli calibrate) justiert.
 * Logit-Einheiten: +0,4 verschiebt z. B. 50 % → ca. 60 %.
 */
export const C = {
  /** Wirkung eines Unterschieds von 20 internen Punkten (= 2 Anzeigepunkte) in Logit */
  K: 0.15,
  /** Wirkung Schütze vs. Torhüter auf die Torwahrscheinlichkeit */
  K_SHOT: 0.15,
  /** Tagesform je Team (Standardabweichung, Logit) */
  DAY_FORM_SD: 0.2,
  /** Anteil der Tagesform, der auf Puckbesitz-Duelle wirkt (Rest wirkt auf den Abschluss) */
  DAY_FORM_POSSESSION: 0.35,
  /** Tagesform des Torhüters (Standardabweichung, Logit) */
  GOALIE_FORM_SD: 0.22,

  // --- Personelle Überlegenheit (je zusätzlichem Feldspieler) ---
  ADV_BREAKOUT: 0.5,
  ADV_ENTRY: 0.45,
  ADV_TURNOVER: 0.5,
  ADV_SHOT_RATE: 0.45,
  ADV_QUALITY: 0.55,
  /** Mehr Raum im 3-gegen-3 (Schussrate und -qualität) */
  OT_OPEN_ICE: 1.3,

  /** Spielstandseffekt: Zuschlag/Abschlag auf die Schussrate im 3. Drittel */
  SCORE_EFFECT_TRAIL: 0.3,
  SCORE_EFFECT_LEAD: 0.2,

  /** Heimvorteil auf alle Duelle */
  HOME: 0.04,

  // --- Zeitbedarf je Phase (Sekunden) ---
  T_FACEOFF: [1, 3],
  T_BREAKOUT: [4, 8],
  T_NEUTRAL: [3, 6],
  T_OFFENSE: [4, 8],

  // --- Breakout ---
  BREAKOUT_BASE: 0.75,
  /** Aufteilung bei misslungenem Breakout */
  BREAKOUT_FAIL: { chip: 0.47, turnover: 0.38, icing: 0.15 },

  // --- Neutrale Zone ---
  ENTRY_CONTROLLED_BASE: 0.55,
  DUMP_RECOVER_BASE: -0.55,

  // --- Angriffszone ---
  SHOT_PER_ACTION: 0.32,
  TURNOVER_BASE: 0.22,
  STOPPAGE_PER_ACTION: 0.035,

  // --- Schüsse: Torwahrscheinlichkeit bei Schuss aufs Tor (vor Skill-Effekt) ---
  Q_SLOT: 0.13,
  Q_CIRCLE: 0.06,
  Q_POINT: 0.027,
  Q_REBOUND: 0.24,
  Q_RUSH_BONUS: 0.04,
  Q_TURNOVER_BONUS: 0.05,
  BLOCK: { slot: 0.12, circle: 0.24, point: 0.38, rebound: 0.05 },
  MISS_BASE: 0.3,
  REBOUND_BASE: 0.2,
  FREEZE: 0.55,

  // --- Strafen ---
  PENALTY_PER_DUEL: 0.015,
  PENALTY_LENGTH: 120,

  // --- Wechsel & Ermüdung ---
  SHIFT_F: 45,
  SHIFT_D: 50,
  ON_THE_FLY_CHANCE: 0.35,
  DRAIN: 0.85,
  RECOVER: 0.34,
  /** Leistungsfaktor bei Frische 0 (bei 100 = 1,0) */
  FATIGUE_FLOOR: 0.8,

  // --- Matchups (Erfolgsquote, ein Teil kommt aus der Trainerqualität) ---
  MATCHUP_HOME: 0.85,
  MATCHUP_AWAY: 0.45,
  MATCHUP_ON_THE_FLY: 0.3,

  // --- Leeres Tor ---
  /** Chance auf einen Schuss aufs leere Tor nach erfolgreicher Befreiung */
  EMPTY_NET_ATTEMPT: 0.35,

  // --- Penaltyschießen ---
  SHOOTOUT_BASE: 0.33,
  SHOOTOUT_ROUNDS: 5,
} as const;
