# Kalibrierung Match-Engine v0

Stand: 23.11.2026 – erzeugt mit `pnpm sim calibrate 10` (Welt-Seed 2026). Richtwerte sind Orientierungsgrößen für europäisches Profi-Eishockey, keine offiziellen Ligastatistiken.

```

Kalibrierung: 3640 Spiele (10 Saisons à 52 Spieltage) in 34.5 s (9,48 ms/Spiel)

Kennzahl (je Team und Spiel)             Engine   Richtwert
Tore                                       2,87   2,8 – 3,3
Schüsse aufs Tor                           29,6   27 – 32
Schussversuche (Corsi)                     56,7   50 – 60
davon geblockt                             14,6   12 – 16
davon vorbei                               12,5   10 – 14
Fangquote                                90,3 %   90,5 – 91,5 %
xG                                         2,88   ≈ Tore
Überzahlspiele                             3,40   3,0 – 4,0
Überzahlquote                            17,7 %   17 – 22 %
Strafminuten                                6,8   6 – 9
Checks                                     15,7   15 – 25
Breakout sauber                          66,0 %   (beobachten)
kontrollierte Eintritte erfolgreich      62,9 %   (beobachten)
Dump-ins zurückerobert                   36,5 %   25 – 40 %

Spiele mit Verlängerung                  16,6 %   20 – 25 %
davon Penaltyschießen                    48,5 %   40 – 55 %
Heimsiege                                55,4 %   52 – 56 %
Ein-Tor-Spiele (reguläre Zeit)           29,9 %   25 – 32 %
Spiele mit Corsi > 2:1                    3,2 %   < 5 %

Siegquote des Favoriten (Stärkeunterschied in Anzeigepunkten)
ausgeglichen (< 0,3)                     53,2 %   (1080 Spiele)
leichter Favorit (0,3–0,8)               58,7 %   (1600 Spiele)
Favorit (0,8–1,5)                        71,6 %   (880 Spiele)
klarer Favorit (> 1,5)                   73,8 %   (80 Spiele)
Ziel klarer Favorit                               ca. 65 – 70 %
```

## Offene Punkte

- Verlängerungsquote (16,6 %) etwas unter Richtwert → Spielstandseffekte/3-gegen-3 nachjustieren
- Fangquote (90,3 %) knapp unter Richtwert
- Torhüter-Rotation fehlt noch (Stammtorhüter spielt alle Spiele) → Meilenstein 4 (KI-Manager)
- Torhüter vom Eis (6-gegen-5) und Coaching-Regeln → Meilenstein 6

## Beispielspiel (`pnpm sim match 3`)

```

=== Grünbach Hornets – EHC Kaltenbrunn Eisbrecher ===


00:00     1. Drittel beginnt.
00:17  🚨 TOR für Grünbach Hornets! A. Doyle (N. Kowalchuk, J. Hartl) – 1:0
04:18  🧤 Starke Parade von S. Eder gegen D. Kastl!
05:19  🚨 TOR für Grünbach Hornets! N. Kowalchuk (S. Becker, T. Eder) – 2:0
06:08  ⏱  Strafe: V. Engel (GRB) – 2 Minuten wegen Haken
09:07  🚨 TOR für EHC Kaltenbrunn Eisbrecher! J. Schmid (C. Hofmann, M. Engel) – 2:1
11:45  ⏱  Strafe: S. Becker (GRB) – 2 Minuten wegen Spielverzögerung
14:46  🚨 TOR für Grünbach Hornets! N. Kowalchuk (A. Laine, A. Doyle) – 3:1
20:00     Ende 1. Drittel: GRB 3:1 KAL (Schüsse 14:7)

00:00     2. Drittel beginnt.
00:14  ⏱  Strafe: J. Hartl (GRB) – 2 Minuten wegen Ellbogencheck
01:28  🚨 TOR für EHC Kaltenbrunn Eisbrecher! C. Hofmann (ohne Vorlage) – 3:2 – Überzahltor
03:09  ⏱  Strafe: J. Vogl (KAL) – 2 Minuten wegen Unkorrekter Körperangriff
06:40  🚨 TOR für Grünbach Hornets! J. Hartl (N. Kowalchuk, C. Kastl) – 4:2
07:09  🧤 Starke Parade von P. Krämer gegen J. Vogl!
07:34  🚨 TOR für Grünbach Hornets! P. Vogl (A. Doyle) – 5:2
12:49  🚨 TOR für Grünbach Hornets! J. Hartl (A. Doyle, A. Laine) – 6:2
13:37  ⏱  Strafe: N. Sutherland (KAL) – 2 Minuten wegen Hoher Stock
16:49  🧤 Starke Parade von S. Eder gegen Q. Kraus!
20:00     Ende 2. Drittel: GRB 6:2 KAL (Schüsse 13:3)

00:00     3. Drittel beginnt.
01:48  🚨 TOR für Grünbach Hornets! N. Roth (V. Engel, L. Maier) – 7:2
05:40  ⏱  Strafe: M. Thaler (KAL) – 2 Minuten wegen Crosscheck
08:46  ⏱  Strafe: F. Wagner (GRB) – 2 Minuten wegen Behinderung
09:07  🧤 Starke Parade von P. Krämer gegen N. Sutherland!
11:02  ⏱  Strafe: M. Tóth (KAL) – 2 Minuten wegen Spielverzögerung
15:48  🚨 TOR für EHC Kaltenbrunn Eisbrecher! M. Tóth (M. Čermák, C. Hofmann) – 7:3
16:39  🧤 Starke Parade von P. Krämer gegen M. Thaler!
20:00     Ende 3. Drittel: GRB 7:3 KAL (Schüsse 12:5)

Endstand: GRB 7:3 KAL  (3:1, 3:1, 1:1)

Mannschaftsstatistik                  GRB        KAL
Tore                                    7          3
Schüsse aufs Tor                       39         15
Schussversuche (Corsi)                 72         35
Expected Goals (xG)                  4,02       1,58
Geblockte eigene Schüsse               18          9
Überzahl                              0/4        1/4
Strafminuten                            8          8
Bullys gewonnen                 38 (59 %)  26 (41 %)
Breakout sauber                 74 % (77) 60 % (100)
Zoneneintritt kontrolliert          31/40      19/43
Dump-ins zurückerobert              19/46      13/46
Zeit in Angriffszone                16:20       9:05
Checks                                 13         24
Puckverluste / -gewinne           36 / 43    43 / 36

--- Grünbach Hornets: Reihen (5-gegen-5) ---
Einheit     Eiszeit    Corsi         xG   Tore
Reihe 1       14:40     22:9  1,30:0,34    5:0
Reihe 2       13:31    15:10  0,84:0,50    0:2
Reihe 3        9:28     10:4  0,48:0,16    1:1
Reihe 4        6:50      9:3  0,67:0,13    1:0
Paar 1        17:52    22:10  1,20:0,38    4:0
Paar 2        15:15    16:10  0,74:0,44    2:2
Paar 3        11:21     18:6  1,35:0,31    1:1

Spieler                  Pos  T  A  S/V   +/-  Eiszeit  Schüsse  xG    Bully
Austin Doyle             LD   1  3  4/7    +4    27:59        4  0,18  
Nolan Kowalchuk          LW   2  2  7/15   +5    23:40        7  0,93  0/4
Julian Hartl             C    2  1  4/4    +5    22:46        4  0,33  19/30
Aleksi Laine             RD   0  2  1/4    +4    27:00        1  0,05  
Tim Eder                 LD   0  1  1/2    +1    21:39        1  0,04  
Simon Becker             RD   0  1  0/0    +1    20:40        0  0,00  
Christian Kastl          RW   0  1  1/2    +5    17:59        1  0,19  
Niklas Roth              C    1  0  2/6     0    12:46        2  0,26  6/10
Vincent Engel            LW   0  1  2/4     0     9:28        2  0,23  
Leon Maier               RW   0  1  1/1     0     9:28        1  0,03  
Philipp Vogl             C    1  0  4/5    +1     6:50        4  0,42  4/5
Valentin Brandl          C    0  0  5/8    -1    21:05        5  0,37  9/15
Tomáš Dvořák             LW   0  0  4/7    -1    18:22        4  0,53  
Dominik Kastl            RW   0  0  2/4    -1    16:36        2  0,23  
Valentin Huber           LD   0  0  0/0     0    11:21        0  0,00  
Felix Wagner             RD   0  0  0/1     0    11:21        0  0,01  
Tobias Winkler           LW   0  0  0/1    +1     6:50        0  0,10  
Quirin Kraus             RW   0  0  1/1    +1     6:50        1  0,11  
Torhüter Paul Krämer: 12/15 Paraden (80,0 %)

--- EHC Kaltenbrunn Eisbrecher: Reihen (5-gegen-5) ---
Einheit     Eiszeit    Corsi         xG   Tore
Reihe 1       14:40    11:18  0,53:0,97    0:2
Reihe 2       13:20     7:14  0,36:0,75    1:3
Reihe 3        9:45     7:16  0,23:1,04    2:2
Reihe 4        6:43      1:8  0,01:0,52    0:0
Paar 1        17:22    10:13  0,44:0,74    1:2
Paar 2        15:42    11:24  0,52:1,34    1:4
Paar 3        11:24     5:19  0,17:1,21    1:1

Spieler                  Pos  T  A  S/V   +/-  Eiszeit  Schüsse  xG    Bully
Christian Hofmann        LW   1  2  3/7     0    12:18        3  0,35  
Marco Engel              LD   0  1  0/1    -3    25:35        0  0,01  
Michal Tóth              RD   1  0  2/4    -1    25:18        2  0,07  
Martin Čermák            LD   0  1  0/0    -1    24:07        0  0,00  
Jonas Schmid             C    1  0  1/2     0     9:45        1  0,09  5/12
Dylan Fraser             LW   0  0  1/3    -2    24:28        1  0,13  
Marcel Thaler            RW   0  0  2/3    -2    22:41        2  0,16  
Christian Gruber         C    0  0  0/3    -2    21:25        0  0,22  13/24
Christian Fischer        C    0  0  3/4    -3    19:50        3  0,19  6/13
Daniel Dietrich          RD   0  0  0/2    -3    19:40        0  0,04  
Nolan Sutherland         LW   0  0  1/2    -3    18:09        1  0,15  1/7
Quirin Schmid            RD   0  0  0/2    -1    13:56        0  0,02  
Jannik Vogl              RW   0  0  2/2    -3    13:20        2  0,14  
Patrick Brandl           LD   0  0  0/0    -1    11:24        0  0,00  
Julian Thaler            RW   0  0  0/0     0     9:45        0  0,00  
Stefan Zeller            LW   0  0  0/0     0     6:43        0  0,00  
Johannes Brandl          C    0  0  0/0     0     6:43        0  0,00  1/8
Elias Wagner             RW   0  0  0/0     0     6:43        0  0,00  
Torhüter Simon Eder: 32/39 Paraden (82,1 %)
```

## Beispielsaison (`pnpm sim season 7`)

```

Abschlusstabelle Hauptrunde (364 Spiele)

 #  Verein                        Sp   S  SnV  NnV   N     Tore  Pkt  Stärke
 1  EV Rabenau Raben              52  28    5    4  15  164:138   98  11,0  VF 
 2  ERC Lindheim Luchse           52  25    7    5  15  151:122   94  11,6  VF 
 3  EC Falkenstein Greifen        52  28    3    3  18  167:125   93  11,9  VF 
 4  SV Moosberg Mammuts           52  27    5    0  20  168:144   91  10,6  VF 
 5  EHC Ostervald Wölfe           52  23    8    4  17  165:148   89  11,5  VF 
 6  ERC Tannried Tiger            52  23    5    3  21  160:157   82  11,3  VF 
 7  ESV Hohenmark Steinböcke      52  23    4    4  21  171:147   81  11,0  PPO
 8  SC Sturmhafen Haie            52  22    4    4  22  164:154   78  10,8  PPO
 9  Eisenried Bisons              52  23    2    5  22  170:182   78  10,9  PPO
10  Blauwald Blizzards            52  21    3    2  26  155:160   71  10,5  PPO
11  Weißenhagen Wildcats          52  19    0    7  26  143:171   64  10,3  PD 
12  EHC Kaltenbrunn Eisbrecher    52  16    5    5  26  147:158   63  10,8  PD 
13  EC Rotfels Panther            52  17    3    5  27  125:181   62  10,2  PD 
14  Grünbach Hornets              52  13    2    5  32  122:185   48  10,5  PD 

Topscorer
 1. Brandon O’Brien          TAN  LW  US     52 Sp  35 T  21 A   56 P  (Gesamt 13)
 2. Cole Bouchard            BLW  C   CA     52 Sp  27 T  29 A   56 P  (Gesamt 12)
 3. Sebastian Dietrich       TAN  C   DE     52 Sp  20 T  36 A   56 P  (Gesamt 13)
 4. Jonas Seitz              MOO  C   DE     52 Sp  22 T  28 A   50 P  (Gesamt 13)
 5. Cole Ritchie             EIS  LW  CA     52 Sp  33 T  16 A   49 P  (Gesamt 12)
 6. Anton Kraus              RAB  RW  DE     52 Sp  29 T  20 A   49 P  (Gesamt 12)
 7. Tobias Hofmann           RAB  LW  DE     52 Sp  24 T  24 A   48 P  (Gesamt 12)
 8. Florian Moser            HOM  LW  DE     52 Sp  36 T  11 A   47 P  (Gesamt 12)
 9. Tim Pfeiffer             MOO  LW  DE     52 Sp  26 T  21 A   47 P  (Gesamt 12)
10. Michael Seitz            FAL  C   DE     52 Sp  22 T  25 A   47 P  (Gesamt 12)
11. Sami Laine               OST  LW  FI     52 Sp  26 T  20 A   46 P  (Gesamt 12)
12. Florian Becker           BLW  LW  DE     52 Sp  31 T  14 A   45 P  (Gesamt 12)

Torhüter (mind. 20 Spiele)
Vincent Steiner          LIN  52 Sp  Fangquote 91,2 %  GAA 2,31
Marcel Gruber            FAL  52 Sp  Fangquote 91,0 %  GAA 2,37
Trevor O’Brien           HOM  52 Sp  Fangquote 90,9 %  GAA 2,74
Leon Stadler             RAB  52 Sp  Fangquote 90,9 %  GAA 2,57
Andreas Steiner          MOO  52 Sp  Fangquote 90,7 %  GAA 2,76
Jiří Veselý              BLW  52 Sp  Fangquote 90,3 %  GAA 3,02
Austin Walsh             OST  52 Sp  Fangquote 90,0 %  GAA 2,79
Simon Brunner            TAN  52 Sp  Fangquote 90,0 %  GAA 2,95
```
