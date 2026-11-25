# Kalibrierung Match-Engine

Stand: 25.11.2026 (Meilenstein 6a: Special Teams, Torhüter raus, Matchups, Coaching-Regeln) – erzeugt mit `pnpm sim calibrate 10` (Welt-Seed 2026). Richtwerte sind Orientierungsgrößen für europäisches Profi-Eishockey, keine offiziellen Ligastatistiken.

```

Kalibrierung: 3640 Spiele (10 Saisons à 52 Spieltage) in 34.0 s (9,34 ms/Spiel)

Kennzahl (je Team und Spiel)             Engine   Richtwert
Tore                                       3,08   2,8 – 3,3
Schüsse aufs Tor                           31,0   27 – 32
Schussversuche (Corsi)                     59,4   50 – 60
davon geblockt                             15,1   12 – 16
davon vorbei                               13,4   10 – 14
Fangquote                                90,1 %   90,5 – 91,5 %
xG                                         3,08   ≈ Tore
Überzahlspiele                             3,61   3,0 – 4,0
Überzahlquote                            16,7 %   17 – 22 %
Strafminuten                                7,2   6 – 9
Checks                                     17,9   15 – 25
Breakout sauber                          56,7 %   (beobachten)
kontrollierte Eintritte erfolgreich      60,7 %   (beobachten)
Dump-ins zurückerobert                   37,3 %   25 – 40 %

Spiele mit Verlängerung                  19,8 %   20 – 25 %
davon Penaltyschießen                    50,1 %   40 – 55 %
Heimsiege                                55,2 %   52 – 56 %
Ein-Tor-Spiele (reguläre Zeit)           24,1 %   25 – 32 %
Spiele mit Corsi > 2:1                    9,6 %   < 5 %

Siegquote des Favoriten (Stärkeunterschied in Anzeigepunkten)
ausgeglichen (< 0,3)                     49,8 %   (1320 Spiele)
leichter Favorit (0,3–0,8)               58,1 %   (1720 Spiele)
Favorit (0,8–1,5)                        69,1 %   (560 Spiele)
klarer Favorit (> 1,5)                   75,0 %   (40 Spiele)
Ziel klarer Favorit                               ca. 65 – 70 %
```

## Offene Punkte

- Überzahlquote (≈ 17 %) am unteren Rand
- Fangquote (≈ 90 %) leicht unter Richtwert; enthält Tore ins leere Tor
- Verlängerungsquote (≈ 20 %) am unteren Rand
- Corsi > 2:1 in ≈ 10 % der Spiele (Spielstile + Brechstange-Regeln) → Taktik-Effekte prüfen

## Beispielsaison (`pnpm sim season 2026`)

```

Saison komplett simuliert: 428 Spiele, 74 Spieltage in 5.5 s

 #  Verein                        Sp   S  SnV  NnV   N     Tore  Pkt  Stärke
 1  EC Falkenstein Greifen        52  37    3    6   6  207:114  123  11,8  VF 
 2  EHC Ostervald Wölfe           52  29    6    0  17  196:145   99  11,1  VF 
 3  ERC Tannried Tiger            52  29    4    1  18  196:167   96  10,8  VF 
 4  Grünbach Hornets              52  24    5    4  19  186:160   86  10,6  VF 
 5  EV Rabenau Raben              52  25    3    3  21  162:144   84  11,2  VF 
 6  Blauwald Blizzards            52  22    4    6  20  193:211   80  10,2  VF 
 7  EHC Kaltenbrunn Eisbrecher    52  22    4    1  25  199:203   75  10,7  PPO
 8  SC Sturmhafen Haie            52  20    4    5  23  117:145   73  11,1  PPO
 9  Weißenhagen Wildcats          52  19    5    3  25  160:188   70  10,7  PPO
10  ESV Hohenmark Steinböcke      52  18    5    3  26  158:158   67  11,2  PPO
11  Eisenried Bisons              52  17    4    8  23  118:143   67  10,6  PD 
12  ERC Lindheim Luchse           52  14    5    8  25  165:203   60  10,8  PD 
13  EC Rotfels Panther            52  14    5    5  28  140:171   57  10,5  PD 
14  SV Moosberg Mammuts           52  13    4    8  27  114:159   55  10,4  PD 

Nachsaison
Pre-Playoffs     EHC Kaltenbrunn Eisbrecher   0:2  ESV Hohenmark Steinböcke     → ESV Hohenmark Steinböcke
Pre-Playoffs     SC Sturmhafen Haie           2:0  Weißenhagen Wildcats         → SC Sturmhafen Haie
Playdowns        Eisenried Bisons             2:4  SV Moosberg Mammuts          → SV Moosberg Mammuts
Playdowns        ERC Lindheim Luchse          4:0  EC Rotfels Panther           → ERC Lindheim Luchse
Viertelfinale    EC Falkenstein Greifen       4:2  ESV Hohenmark Steinböcke     → EC Falkenstein Greifen
Viertelfinale    EHC Ostervald Wölfe          4:1  SC Sturmhafen Haie           → EHC Ostervald Wölfe
Viertelfinale    ERC Tannried Tiger           4:2  Blauwald Blizzards           → ERC Tannried Tiger
Viertelfinale    Grünbach Hornets             2:4  EV Rabenau Raben             → EV Rabenau Raben
Playdown-Finale  Eisenried Bisons             4:3  EC Rotfels Panther           → Eisenried Bisons
Halbfinale       EC Falkenstein Greifen       4:2  EV Rabenau Raben             → EC Falkenstein Greifen
Halbfinale       EHC Ostervald Wölfe          4:3  ERC Tannried Tiger           → EHC Ostervald Wölfe
Finale           EC Falkenstein Greifen       4:3  EHC Ostervald Wölfe          → EC Falkenstein Greifen

Meister: EC Falkenstein Greifen   Absteiger: EC Rotfels Panther

Finanzen (Saison komplett, Aug–Jul)
Verein                        Ø Zuschauer    Einnahmen     Ausgaben    Ergebnis       Konto  Ziel / Vorstand
EC Falkenstein Greifen              3.854     8,48 Mio     7,06 Mio    1,42 Mio    2,13 Mio  title / 77
EHC Ostervald Wölfe                 4.973     5,78 Mio     4,10 Mio    1,68 Mio    2,30 Mio  semifinal / 74
ERC Tannried Tiger                  3.825     4,73 Mio     4,05 Mio    0,68 Mio    1,29 Mio  quarterfinal / 79
Grünbach Hornets                    2.057     2,87 Mio     2,84 Mio    0,03 Mio    0,62 Mio  survival / 85
EV Rabenau Raben                    3.725     4,76 Mio     4,18 Mio    0,58 Mio    1,35 Mio  title / 40
Blauwald Blizzards                  2.038     2,93 Mio     2,86 Mio    0,07 Mio    0,61 Mio  survival / 80
EHC Kaltenbrunn Eisbrecher          3.035     3,73 Mio     3,89 Mio   -0,16 Mio    0,34 Mio  prePlayoffs / 74
SC Sturmhafen Haie                  2.864     5,16 Mio     5,11 Mio    0,05 Mio    0,69 Mio  quarterfinal / 38
Weißenhagen Wildcats                2.094     2,82 Mio     2,89 Mio   -0,06 Mio    0,37 Mio  prePlayoffs / 83
ESV Hohenmark Steinböcke            4.028     4,64 Mio     4,36 Mio    0,28 Mio    1,15 Mio  semifinal / 35
Eisenried Bisons                    2.185     3,53 Mio     3,37 Mio    0,16 Mio    0,44 Mio  prePlayoffs / 43
ERC Lindheim Luchse                 2.423     5,07 Mio     5,17 Mio   -0,09 Mio    0,72 Mio  prePlayoffs / 48
EC Rotfels Panther                  1.682     2,67 Mio     2,77 Mio   -0,10 Mio    0,24 Mio  survival / 27
SV Moosberg Mammuts                 2.563     4,46 Mio     4,48 Mio   -0,03 Mio    0,69 Mio  survival / 75

Topscorer Hauptrunde
 1. Quirin Ebner             OST  C   DE     52 Sp  31 T  34 A   65 P  (Gesamt 13)
 2. Drew Carlson             BLW  RW  US     52 Sp  31 T  31 A   62 P  (Gesamt 12)
 3. Luca Ostermann           TAN  LW  DE     52 Sp  38 T  23 A   61 P  (Gesamt 12)
 4. Marcel Köhler            FAL  LW  DE     52 Sp  23 T  36 A   59 P  (Gesamt 12)
 5. Sebastian Pfeiffer       GRB  RW  DE     52 Sp  36 T  21 A   57 P  (Gesamt 12)
 6. Roberts Ozols            TAN  LD  LV     52 Sp  13 T  44 A   57 P  (Gesamt 13)
 7. Lukáš Veselý             FAL  RD  CZ     52 Sp   6 T  51 A   57 P  (Gesamt 13)
 8. Otto Nieminen            TAN  RD  FI     52 Sp   8 T  48 A   56 P  (Gesamt 13)
 9. Fabian Maier             HOM  C   DE     52 Sp  24 T  31 A   55 P  (Gesamt 14)
10. Ryan Bouchard            FAL  RW  CA     52 Sp  36 T  18 A   54 P  (Gesamt 14)
11. Simon Steiner            HOM  LW  DE     52 Sp  20 T  33 A   53 P  (Gesamt 12)
12. Rihards Liepiņš          KAL  LW  LV     52 Sp  29 T  23 A   52 P  (Gesamt 12)

Torhüter Hauptrunde (mind. 15 Spiele)
Connor Gagnon            FAL  39 Sp  Fangquote 92,1 %  GAA 2,13  Shutouts 8
Paul Wagner              MOO  39 Sp  Fangquote 91,3 %  GAA 2,62  Shutouts 5
Elias Pfeiffer           OST  39 Sp  Fangquote 91,3 %  GAA 2,52  Shutouts 4
Hunter Hendricks         EIS  39 Sp  Fangquote 91,1 %  GAA 2,57  Shutouts 0
Sean Bergstrom           ROT  39 Sp  Fangquote 91,0 %  GAA 2,73  Shutouts 2
Nolan Pelletier          RAB  39 Sp  Fangquote 90,6 %  GAA 2,74  Shutouts 4
Evan Morrison            TAN  39 Sp  Fangquote 90,6 %  GAA 3,13  Shutouts 0
Andreas Albrecht         STU  39 Sp  Fangquote 90,3 %  GAA 2,84  Shutouts 2
Elias Ebner              BLW  39 Sp  Fangquote 90,3 %  GAA 3,26  Shutouts 0
Tyler Ritchie            GRB  39 Sp  Fangquote 90,2 %  GAA 2,80  Shutouts 3
```

## Beispielspiel (`pnpm sim match 3`)

```

=== Grünbach Hornets – EHC Kaltenbrunn Eisbrecher ===


00:00     1. Drittel beginnt.
00:17  🚨 TOR für Grünbach Hornets! A. Hakala (B. Hofmann, A. Wagner) – 1:0
00:57  🚨 TOR für Grünbach Hornets! F. Fischer (B. Morrison, A. Hakala) – 2:0
01:42  🧤 Starke Parade von S. Brandl gegen M. Hofer!
03:41  ⏱  Strafe: S. Pfeiffer (GRB) – 2 Minuten wegen Halten des Stocks
05:00  🚨 TOR für EHC Kaltenbrunn Eisbrecher! T. Köhler (R. Kalniņš, S. Maier) – 2:1 – Überzahltor
05:56  ⏱  Strafe: R. Kalniņš (KAL) – 2 Minuten wegen Haken
06:41  🚨 TOR für Grünbach Hornets! M. Hofer (B. Morrison) – 3:1 – Überzahltor
07:00  🧤 Starke Parade von T. Ritchie gegen M. Reiter!
12:05  ⏱  Strafe: T. Köhler (KAL) – 2 Minuten wegen Haken
12:20  🚨 TOR für Grünbach Hornets! M. Hofer (A. Hakala, B. Hofmann) – 4:1 – Überzahltor
14:27  🚨 TOR für Grünbach Hornets! V. Pfeiffer (A. Hakala, J. Ostermann) – 5:1
16:03  🧤 Starke Parade von T. Ritchie gegen M. Fuchsberger!
20:00     Ende 1. Drittel: GRB 5:1 KAL (Schüsse 17:12)

00:00     2. Drittel beginnt.
03:31  ⏱  Strafe: E. Virtanen (KAL) – 2 Minuten wegen Unkorrekter Körperangriff
06:24  🚨 TOR für Grünbach Hornets! F. Fischer (P. Bauer) – 6:1
07:56  🚨 TOR für Grünbach Hornets! A. Wagner (V. Winkler, S. Pfeiffer) – 7:1
11:42  ⏱  Strafe: C. Morrison (KAL) – 2 Minuten wegen Beinstellen
11:58  🧤 Starke Parade von T. Ritchie gegen M. Fuchsberger!
14:31  🧤 Starke Parade von S. Brandl gegen J. Ostermann!
15:10  ⏱  Strafe: E. Virtanen (KAL) – 2 Minuten wegen Spielverzögerung
16:25  🚨 TOR für Grünbach Hornets! A. Wagner (V. Winkler) – 8:1 – Überzahltor
16:41  🧤 Starke Parade von T. Ritchie gegen E. Seidl!
20:00     Ende 2. Drittel: GRB 8:1 KAL (Schüsse 17:6)

00:00     3. Drittel beginnt.
02:40  🧤 Starke Parade von S. Brandl gegen T. Huber!
04:26  ⏱  Strafe: J. Winkler (KAL) – 2 Minuten wegen Crosscheck
04:40  ⏱  Strafe: S. Maier (KAL) – 2 Minuten wegen Ellbogencheck
05:16  🧤 Starke Parade von S. Brandl gegen B. Hofmann!
15:17  ⏱  Strafe: B. Morrison (GRB) – 2 Minuten wegen Stockschlag
20:00     Ende 3. Drittel: GRB 8:1 KAL (Schüsse 13:4)

Endstand: GRB 8:1 KAL  (5:1, 3:0, 0:0)

Mannschaftsstatistik                  GRB        KAL
Tore                                    8          1
Schüsse aufs Tor                       47         22
Schussversuche (Corsi)                 86         51
Expected Goals (xG)                  4,79       3,27
Geblockte eigene Schüsse               23          7
Überzahl                              3/7        1/2
Strafminuten                            4         14
Bullys gewonnen                 33 (45 %)  40 (55 %)
Breakout sauber                 78 % (73)  37 % (93)
Zoneneintritt kontrolliert          37/64      18/29
Dump-ins zurückerobert               9/18      11/32
Zeit in Angriffszone                17:06      11:37
Checks                                 11         16
Puckverluste / -gewinne           36 / 49    49 / 36

--- Grünbach Hornets: Reihen (5-gegen-5) ---
Einheit     Eiszeit    Corsi         xG   Tore
Reihe 1       16:25    27:17  1,30:1,10    2:1
Reihe 2       14:23     22:9  1,65:0,62    3:0
Reihe 3       10:08    11:12  0,46:0,55    2:0
Reihe 4        7:05      9:4  0,56:0,32    1:0
Paar 1        18:48    27:15  1,26:0,75    5:0
Paar 2        16:51    26:17  1,59:0,95    1:0
Paar 3        12:22    16:10  1,12:0,90    2:1

Spieler                  Pos  T  A  S/V   +/-  Eiszeit  Schüsse  xG    Bully
Aleksi Hakala            LD   1  3  6/11   +3    27:04        6  0,29  
Anton Wagner             C    2  1  5/8    +2    21:15        5  0,60  14/23
Brayden Morrison         RD   0  2  2/6    +3    25:42        2  0,17  
Benedikt Hofmann         LW   0  2  5/11   +2    24:44        5  0,53  
Valentin Winkler         LD   0  2  3/5    +1    20:49        3  0,07  
Manuel Hofer             RW   2  0  7/8    +2    20:17        7  0,68  4/13
Florian Fischer          C    2  0  6/11   +2    18:22        6  0,92  8/15
Sebastian Pfeiffer       RW   0  1  3/6    +2    23:15        3  0,23  
Philipp Bauer            RD   0  1  0/0    +1    12:22        0  0,00  
Jannik Ostermann         LW   0  1  2/3    +1     7:05        2  0,21  
Valentin Pfeiffer        C    1  0  2/2    +1     7:05        2  0,24  2/6
Valentin Moser           RD   0  0  1/1    +1    21:41        1  0,03  
Jonas Franke             LW   0  0  0/6    +2    17:07        0  0,42  
Alexander Fuchsberger    LD   0  0  0/0    +1    12:22        0  0,00  
Thomas Huber             LW   0  0  1/1     0    10:08        1  0,10  
Paul Vogl                C    0  0  2/3     0    10:08        2  0,12  5/16
Valentin Kellner         RW   0  0  2/3     0    10:08        2  0,14  
Jonas Hartl              RW   0  0  0/1    +1     7:05        0  0,03  
Torhüter Tyler Ritchie: 21/22 Paraden (95,5 %)

--- EHC Kaltenbrunn Eisbrecher: Reihen (5-gegen-5) ---
Einheit     Eiszeit    Corsi         xG   Tore
Reihe 1       16:19    11:26  0,62:1,37    0:2
Reihe 2       14:03    16:20  0,88:1,32    1:2
Reihe 3       10:26     7:14  0,43:0,86    0:2
Reihe 4        7:13      8:9  0,66:0,42    0:2
Paar 1        19:07    17:31  1,10:1,81    0:3
Paar 2        16:36    18:22  0,88:1,34    0:3
Paar 3        12:17     7:16  0,61:0,82    1:2

Spieler                  Pos  T  A  S/V   +/-  Eiszeit  Schüsse  xG    Bully
Stefan Maier             LD   0  1  0/1    -2    21:55        0  0,01  
Roberts Kalniņš          LW   0  1  0/4    -2    14:56        0  0,17  
Tim Köhler               LW   1  0  3/6    -1    11:19        3  0,43  
Daniel Riedl             LD   0  0  0/2    -2    27:59        0  0,07  
Tim Aigner               RD   0  0  1/3    -2    24:13        1  0,07  
Rihards Liepiņš          LW   0  0  2/3    -1    23:16        2  0,27  
Cole Morrison            RW   0  0  1/3    -1    22:56        1  0,16  1/3
Eetu Virtanen            RD   0  0  2/3    -2    21:18        2  0,05  
Marco Reiter             C    0  0  2/4    -1    21:14        2  0,30  13/28
Maximilian Fuchsberger   C    0  0  4/6    -2    19:21        4  0,46  19/25
Jannik Winkler           RW   0  0  4/6    -2    14:03        4  0,40  
Julian Hofmann           LD   0  0  0/0    -1    12:17        0  0,00  
Leonhard Gruber          RD   0  0  0/1    -1    12:17        0  0,06  
Patrick Kastl            C    0  0  1/2    -1    10:26        1  0,19  4/10
Thomas Vogl              RW   0  0  0/0    -1    10:26        0  0,00  
Simon Hartl              LW   0  0  0/1    -1     7:13        0  0,10  
Stefan Zeller            C    0  0  1/4    -1     7:13        1  0,27  3/7
Elias Seidl              RW   0  0  1/2    -1     7:13        1  0,26  
Torhüter Simon Brandl: 39/47 Paraden (83,0 %)
```
