/** Zahl mit einer Nachkommastelle und deutschem Komma */
export const fmt1 = (n: number) => n.toFixed(1).replace('.', ',');
export const pct1 = (n: number) => `${(n * 100).toFixed(1).replace('.', ',')} %`;
