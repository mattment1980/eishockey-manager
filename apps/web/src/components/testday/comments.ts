import type { Player, TestDay } from '@ehm/schema';
import { hash01, talentStars } from '@ehm/core';
import { SKATER_LABEL, GOALIE_LABEL } from '../../labels.ts';

type Line = TestDay['lines'][number];

const pick = (list: string[], seed: string) => list[Math.floor(hash01(seed) * list.length) % list.length];
const fill = (t: string, p: Player, extra: Record<string, string> = {}) =>
  Object.entries({ name: p.lastName, vorname: p.firstName, ...extra }).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), t);

/** Bezeichnung eines Attributs aus dem Testbericht */
export const attrLabel = (k: string) => (k.startsWith('g.') ? GOALIE_LABEL[k.slice(2) as keyof typeof GOALIE_LABEL] : SKATER_LABEL[k as keyof typeof SKATER_LABEL]) ?? k;

/** Kommentar des Trainers zum Ergebnis eines Spielers (abwechslungsreich, aber reproduzierbar) */
export function coachComment(p: Player, l: Line, age: number, seed: string): string {
  const d = (l.after - l.before) / 10;
  const best = Object.entries(l.attrs).sort((a, b) => b[1] - a[1])[0];
  const worst = Object.entries(l.attrs).sort((a, b) => a[1] - b[1])[0];
  const extra = { best: best ? attrLabel(best[0]) : 'Spiel', worst: worst ? attrLabel(worst[0]) : 'Spritzigkeit' };
  if (l.jump) return fill(pick([
    '{name} ist kaum wiederzuerkennen. Was für ein Sommer – vor allem im Bereich {best} ein riesiger Schritt.',
    'Das ist der Sprung, auf den wir gewartet haben. {name} ist jetzt bereit für mehr Verantwortung.',
    'Ich habe selten jemanden so zulegen sehen. {vorname} hat den ganzen Sommer durchgezogen.',
  ], seed), p, extra);
  if (d >= 0.6) return fill(pick([
    'Starker Sommer von {name}. Im Bereich {best} hat er deutlich zugelegt.',
    '{name} kommt klar verbessert aus dem Sommer. Das sieht man in jeder Übung.',
    'Sehr zufrieden. {vorname} hat an den richtigen Stellen gearbeitet, besonders im Bereich {best}.',
  ], seed), p, extra);
  if (d >= 0.2) return fill(pick([
    'Solide Fortschritte bei {name}, vor allem im Bereich {best}.',
    '{name} hat sich weiter verbessert – kleine Schritte, aber in die richtige Richtung.',
    'Ordentlich. {vorname} ist ein Stück weiter als im Frühjahr.',
  ], seed), p, extra);
  if (d > -0.2) {
    if (age >= 29) return fill(pick(['{name} hält sein Niveau – in seinem Alter ist das schon eine Leistung.', 'Bei {name} alles stabil. Er weiß genau, was sein Körper braucht.'], seed), p, extra);
    if (talentStars(p.hidden.potential) <= 2) return fill(pick(['{name} ist, wie er ist – verlässlich, aber ohne große Sprünge.', 'Wenig Veränderung bei {name}. Viel Luft nach oben sehe ich nicht.'], seed), p, extra);
    return fill(pick(['Bei {name} hat sich wenig getan. Da erwarte ich mehr – mit Eiszeit kommt das hoffentlich.', '{name} stagniert gerade. Wir müssen schauen, wie wir ihn weiterbringen.', 'Etwas enttäuschend bei {name}. Das Potenzial ist da, aber diesen Sommer kam nicht viel.'], seed), p, extra);
  }
  if (age >= 30) return fill(pick([
    'Das Alter macht sich bei {name} bemerkbar, vor allem im Bereich {worst}. Wir müssen seine Eiszeit klug dosieren.',
    '{name} hat an Spritzigkeit verloren. Mit seiner Erfahrung kann er einiges ausgleichen – aber nicht alles.',
    'Man sieht, dass {vorname} älter wird. Der Kopf ist noch da, die Beine werden langsamer.',
  ], seed), p, extra);
  return fill(pick([
    'Ehrlich gesagt: Das war nichts. {name} hat im Sommer nachgelassen, besonders im Bereich {worst}.',
    '{name} ist schlechter zurückgekommen, als er gegangen ist. Darüber müssen wir reden.',
  ], seed), p, extra);
}

/** Vorstellung eines Nachwuchstalents durch den Trainer */
export function youthComment(p: Player, starsMid: number | null, seed: string): string {
  const pos = p.position === 'G' ? 'im Tor' : p.position === 'LD' || p.position === 'RD' ? 'in der Verteidigung' : 'im Sturm';
  const strong = p.position === 'G' && p.goalie
    ? Object.entries(p.goalie).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => GOALIE_LABEL[k as keyof typeof GOALIE_LABEL])
    : Object.entries(p.skater).filter(([k]) => k !== 'discipline' && k !== 'leadership').sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => SKATER_LABEL[k as keyof typeof SKATER_LABEL]);
  const extra = { pos, s1: strong[0] ?? '', s2: strong[1] ?? '' };
  if (starsMid === null) return fill('Über {vorname} {name} kann ich noch wenig sagen. Spielt {pos}, ist aber schwer einzuschätzen.', p, extra);
  if (starsMid >= 3.5) return fill(pick([
    '{vorname} {name} ist der Beste dieses Jahrgangs. Er hat Anlagen, die man selten sieht – {s1} und {s2} sind schon jetzt stark.',
    'Bei {name} bin ich mir sicher: Der Junge kann es weit bringen. Ein echtes Talent {pos}.',
  ], seed), p, extra);
  if (starsMid >= 2.5) return fill(pick([
    '{name} spielt {pos} und bringt einiges mit, vor allem im Bereich {s1}. Mit Geduld kann daraus ein Stammspieler werden.',
    'Ein interessanter Junge. {vorname} hat Potenzial {pos}, muss aber noch viel lernen.',
  ], seed), p, extra);
  return fill(pick([
    '{name} ist fleißig, aber ich sehe nicht, dass er bei uns den Durchbruch schafft. Eher Mittelmaß.',
    'Ehrlich: Für die Profis wird es bei {vorname} schwer. Im Bereich {s1} ist er ordentlich, der Rest ist Durchschnitt.',
  ], seed), p, extra);
}
