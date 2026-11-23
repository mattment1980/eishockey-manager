/** Namenspools für den Fantasie-Datensatz, je Herkunftsland. */
export interface NamePool {
  first: string[];
  last: string[];
}

export const NAMES: Record<string, NamePool> = {
  DE: {
    first: ['Lukas', 'Jonas', 'Leon', 'Maximilian', 'Felix', 'Tobias', 'Florian', 'Simon', 'Moritz', 'Julian',
      'Dominik', 'Sebastian', 'Fabian', 'Niklas', 'Tim', 'Marco', 'Philipp', 'Kevin', 'Daniel', 'Stefan',
      'Andreas', 'Christian', 'Michael', 'Benedikt', 'Korbinian', 'Quirin', 'Valentin', 'Elias', 'Paul', 'Luca',
      'Jannik', 'Marcel', 'Patrick', 'Thomas', 'Johannes', 'Matthias', 'Alexander', 'Leonhard', 'Anton', 'Vincent'],
    last: ['Huber', 'Bauer', 'Wagner', 'Maier', 'Gruber', 'Hofmann', 'Schmid', 'Weber', 'Fischer', 'Becker',
      'Kraus', 'Lehner', 'Brandl', 'Stadler', 'Eder', 'Wimmer', 'Reiter', 'Moser', 'Zeller', 'Winkler',
      'Haas', 'Kerner', 'Pfeiffer', 'Lindner', 'Vogl', 'Holzer', 'Steiner', 'Brunner', 'Hartl', 'Aigner',
      'Riedl', 'Seidl', 'Schuster', 'Köhler', 'Engel', 'Seitz', 'Franke', 'Ostermann', 'Dietrich', 'Kellner',
      'Roth', 'Sommer', 'Albrecht', 'Krämer', 'Ludwig', 'Ebner', 'Fuchsberger', 'Kastl', 'Mayrhofer', 'Thaler'],
  },
  CA: {
    first: ['Tyler', 'Brett', 'Ryan', 'Cole', 'Logan', 'Brayden', 'Connor', 'Dylan', 'Mitch', 'Jordan', 'Kyle', 'Shane', 'Travis', 'Evan', 'Nolan'],
    last: ['MacDonald', 'Fraser', 'Tremblay', 'Gagnon', 'Campbell', 'McKenzie', 'Boucher', 'Sutherland', 'Ritchie', 'Pelletier', 'Graham', 'Lavoie', 'Morrison', 'Bouchard', 'Kowalchuk'],
  },
  US: {
    first: ['Jake', 'Matt', 'Chris', 'Zach', 'Brandon', 'Austin', 'Hunter', 'Garrett', 'Cody', 'Sean', 'Drew', 'Trevor'],
    last: ['Miller', 'Sullivan', 'Johnson', 'Carlson', 'Peterson', 'Kowalski', 'Hendricks', 'O’Brien', 'Walsh', 'Bergstrom', 'Doyle', 'Hayes'],
  },
  SE: {
    first: ['Oskar', 'Viktor', 'Erik', 'Linus', 'Gustav', 'Albin', 'Filip', 'Hampus', 'Rasmus', 'Elias'],
    last: ['Lindqvist', 'Bergström', 'Sjöberg', 'Nyström', 'Wallin', 'Åberg', 'Holmgren', 'Lundgren', 'Ekholm', 'Forsberg'],
  },
  FI: {
    first: ['Aleksi', 'Joonas', 'Eetu', 'Miro', 'Sami', 'Juuso', 'Teemu', 'Ville', 'Otto', 'Niko'],
    last: ['Virtanen', 'Mäkinen', 'Koskinen', 'Heikkilä', 'Laine', 'Nieminen', 'Salonen', 'Lehtonen', 'Rantanen', 'Hakala'],
  },
  CZ: {
    first: ['Jakub', 'Tomáš', 'Ondřej', 'Martin', 'Lukáš', 'Petr', 'Radek', 'Jiří'],
    last: ['Novák', 'Dvořák', 'Svoboda', 'Procházka', 'Kučera', 'Veselý', 'Horák', 'Čermák'],
  },
  SK: {
    first: ['Marek', 'Peter', 'Matúš', 'Michal', 'Rastislav', 'Juraj'],
    last: ['Hudák', 'Kováč', 'Baláž', 'Tóth', 'Mikuš', 'Šimko'],
  },
  LV: {
    first: ['Kārlis', 'Rihards', 'Edgars', 'Artūrs', 'Roberts'],
    last: ['Ozols', 'Kalniņš', 'Bērziņš', 'Liepiņš', 'Krūmiņš'],
  },
  AT: {
    first: ['Florian', 'Manuel', 'Raphael', 'Lukas', 'Bernhard', 'Thomas'],
    last: ['Pichler', 'Lackner', 'Hofer', 'Wallner', 'Strasser', 'Leitner'],
  },
};

/** Herkunft ausländischer Spieler mit Gewichtung */
export const IMPORT_ORIGINS: [string, number][] = [
  ['CA', 0.36], ['US', 0.18], ['SE', 0.1], ['FI', 0.12], ['CZ', 0.09], ['SK', 0.06], ['LV', 0.05], ['AT', 0.04],
];
