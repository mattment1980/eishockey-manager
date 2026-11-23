import type { MatchEvent, Side } from '@ehm/core';

const rnd = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Position eines Schusses (Mannschaft 0 greift nach rechts an). */
function pos(e: MatchEvent, i: number): [number, number] {
  const a = rnd(i, 1), b = rnd(i, 2);
  let x: number, y: number;
  switch (e.location) {
    case 'slot': x = 160 + a * 20; y = 34 + b * 17; break;
    case 'rebound': x = 179 + a * 7; y = 38 + b * 9; break;
    case 'circle': x = 150 + a * 22; y = b < 0.5 ? 16 + b * 28 : 55 + (b - 0.5) * 28; break;
    default: x = 128 + a * 12; y = 8 + b * 69;
  }
  return e.team === 0 ? [x, y] : [200 - x, 85 - y];
}

export function Rink({ events, colors, mySide }: { events: MatchEvent[]; colors: [string, string]; mySide: Side }) {
  const shots = events.map((e, i) => ({ e, i })).filter(({ e }) => e.type === 'shot' || e.type === 'goal');
  return (
    <figure className="rink-wrap">
      <svg viewBox="-2 -2 204 89" className="rink" role="img" aria-label="Schusskarte">
        <rect x="0" y="0" width="200" height="85" rx="28" fill="#eef5fb" stroke="#9fb3c8" strokeWidth="1" />
        <line x1="11" y1="3" x2="11" y2="82" stroke="#d94848" strokeWidth="0.6" />
        <line x1="189" y1="3" x2="189" y2="82" stroke="#d94848" strokeWidth="0.6" />
        <line x1="75" y1="0" x2="75" y2="85" stroke="#2f6fd6" strokeWidth="1.6" />
        <line x1="125" y1="0" x2="125" y2="85" stroke="#2f6fd6" strokeWidth="1.6" />
        <line x1="100" y1="0" x2="100" y2="85" stroke="#d94848" strokeWidth="1.4" />
        <circle cx="100" cy="42.5" r="15" fill="none" stroke="#2f6fd6" strokeWidth="0.6" />
        {[[31, 20.5], [31, 64.5], [169, 20.5], [169, 64.5]].map(([cx, cy]) => (
          <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="15" fill="none" stroke="#d94848" strokeWidth="0.6" />
        ))}
        <path d="M11 38.5 a4 4 0 0 1 0 8" fill="#cfe3f7" stroke="#d94848" strokeWidth="0.5" transform="translate(0,0)" />
        <path d="M189 38.5 a4 4 0 0 0 0 8" fill="#cfe3f7" stroke="#d94848" strokeWidth="0.5" />
        <rect x="8" y="40" width="3" height="5" fill="none" stroke="#555" strokeWidth="0.5" />
        <rect x="189" y="40" width="3" height="5" fill="none" stroke="#555" strokeWidth="0.5" />
        {shots.map(({ e, i }) => {
          const [x, y] = pos(e, i);
          const c = colors[e.team];
          if (e.type === 'goal') return <g key={i}><circle cx={x} cy={y} r="3.4" fill={c} stroke="#111" strokeWidth="0.8" /><circle cx={x} cy={y} r="5.5" fill="none" stroke={c} strokeWidth="0.6" /></g>;
          if (e.result === 'saved') return <circle key={i} cx={x} cy={y} r="2.2" fill="none" stroke={c} strokeWidth="1" />;
          if (e.result === 'missed') return <path key={i} d={`M${x - 1.6} ${y - 1.6} l3.2 3.2 m0 -3.2 l-3.2 3.2`} stroke={c} strokeWidth="0.8" opacity="0.7" />;
          return <rect key={i} x={x - 1} y={y - 1} width="2" height="2" fill={c} opacity="0.35" />;
        })}
      </svg>
      <figcaption className="legend small muted">
        <span><i className="dot goal" style={{ background: colors[mySide] }} /> Tor</span>
        <span><i className="dot ring" style={{ borderColor: colors[mySide] }} /> gehalten</span>
        <span>× vorbei</span>
        <span>▪ geblockt</span>
        <span>{mySide === 0 ? 'Wir greifen nach rechts an' : 'Wir greifen nach links an'}</span>
      </figcaption>
    </figure>
  );
}
