# Kalibrierung Match-Engine v0

Stand: 24.11.2026 – erzeugt mit `pnpm sim calibrate 10` (Welt-Seed 2026, KI-Vereine mit unterschiedlichen Spielstilen). Richtwerte sind Orientierungsgrößen für europäisches Profi-Eishockey, keine offiziellen Ligastatistiken.

```

Kalibrierung: 3640 Spiele (10 Saisons à 52 Spieltage) in 31.7 s (8,70 ms/Spiel)

Kennzahl (je Team und Spiel)             Engine   Richtwert
Tore                                       2,93   2,8 – 3,3
Schüsse aufs Tor                           31,2   27 – 32
Schussversuche (Corsi)                     59,7   50 – 60
davon geblockt                             14,8   12 – 16
davon vorbei                               13,6   10 – 14
Fangquote                                90,6 %   90,5 – 91,5 %
xG                                         3,03   ≈ Tore
Überzahlspiele                             3,54   3,0 – 4,0
Überzahlquote                            17,7 %   17 – 22 %
Strafminuten                                7,1   6 – 9
Checks                                     17,8   15 – 25
Breakout sauber                          62,5 %   (beobachten)
kontrollierte Eintritte erfolgreich      60,7 %   (beobachten)
Dump-ins zurückerobert                   37,4 %   25 – 40 %

Spiele mit Verlängerung                  16,8 %   20 – 25 %
davon Penaltyschießen                    48,9 %   40 – 55 %
Heimsiege                                56,2 %   52 – 56 %
Ein-Tor-Spiele (reguläre Zeit)           28,8 %   25 – 32 %
Spiele mit Corsi > 2:1                    8,3 %   < 5 %

Siegquote des Favoriten (Stärkeunterschied in Anzeigepunkten)
ausgeglichen (< 0,3)                     56,4 %   (1040 Spiele)
leichter Favorit (0,3–0,8)               57,6 %   (1760 Spiele)
Favorit (0,8–1,5)                        64,9 %   (720 Spiele)
klarer Favorit (> 1,5)                   79,2 %   (120 Spiele)
Ziel klarer Favorit                               ca. 65 – 70 %
```

## Offene Punkte

- Verlängerungsquote (≈ 17 %) unter Richtwert → Spielstandseffekte/3-gegen-3 nachjustieren
- Corsi > 2:1 in ≈ 8 % der Spiele (extreme Spielstile treffen aufeinander) → Taktik-Effekte prüfen
- Torhüter vom Eis (6-gegen-5) und Coaching-Regeln → Meilenstein 6

## Beispielsaison (`pnpm sim season 2026`)

```

Saison komplett simuliert: 421 Spiele, 72 Spieltage in 4.7 s

 #  Verein                        Sp   S  SnV  NnV   N     Tore  Pkt  Stärke
 1  EC Falkenstein Greifen        52  31    3    5  13  180:125  104  11,7  VF 
 2  EHC Ostervald Wölfe           52  29    7    3  13  188:135  104  11,5  VF 
 3  EV Rabenau Raben              52  30    2    5  15  215:166   99  11,1  VF 
 4  ERC Lindheim Luchse           52  25    6    8  13  199:155   95  11,3  VF 
 5  ESV Hohenmark Steinböcke      52  25    5    6  16  169:146   91  11,1  VF 
 6  EHC Kaltenbrunn Eisbrecher    52  20    8    4  20  165:157   80  11,1  VF 
 7  SV Moosberg Mammuts           52  19    9    5  19  182:184   80  10,9  PPO
 8  Weißenhagen Wildcats          52  20    5    5  22  187:210   75  10,6  PPO
 9  Grünbach Hornets              52  19    5    3  25  156:169   70  10,7  PPO
10  Eisenried Bisons              52  17    6    6  23  146:164   69  10,6  PPO
11  ERC Tannried Tiger            52  15    7    9  21  156:185   68  11,0  PD 
12  Blauwald Blizzards            52  14    7    7  24  150:187   63  10,4  PD 
13  SC Sturmhafen Haie            52  16    3    7  26  116:139   61  11,4  PD 
14  EC Rotfels Panther            52   9    2    2  39   75:162   33  9,8  PD 

Nachsaison
Pre-Playoffs     SV Moosberg Mammuts          0:2  Eisenried Bisons             → Eisenried Bisons
Pre-Playoffs     Weißenhagen Wildcats         2:1  Grünbach Hornets             → Weißenhagen Wildcats
Playdowns        ERC Tannried Tiger           4:0  EC Rotfels Panther           → ERC Tannried Tiger
Playdowns        Blauwald Blizzards           0:4  SC Sturmhafen Haie           → SC Sturmhafen Haie
Viertelfinale    EC Falkenstein Greifen       4:1  Eisenried Bisons             → EC Falkenstein Greifen
Viertelfinale    EHC Ostervald Wölfe          3:4  Weißenhagen Wildcats         → Weißenhagen Wildcats
Viertelfinale    EV Rabenau Raben             3:4  EHC Kaltenbrunn Eisbrecher   → EHC Kaltenbrunn Eisbrecher
Viertelfinale    ERC Lindheim Luchse          4:3  ESV Hohenmark Steinböcke     → ERC Lindheim Luchse
Playdown-Finale  Blauwald Blizzards           4:0  EC Rotfels Panther           → Blauwald Blizzards
Halbfinale       EC Falkenstein Greifen       4:2  Weißenhagen Wildcats         → EC Falkenstein Greifen
Halbfinale       ERC Lindheim Luchse          4:0  EHC Kaltenbrunn Eisbrecher   → ERC Lindheim Luchse
Finale           EC Falkenstein Greifen       0:4  ERC Lindheim Luchse          → ERC Lindheim Luchse

Meister: ERC Lindheim Luchse   Absteiger: EC Rotfels Panther

Topscorer Hauptrunde
 1. Zach O’Brien             RAB  RW  US     52 Sp  29 T  34 A   63 P  (Gesamt 12)
 2. Tyler Pelletier          LIN  RW  CA     52 Sp  37 T  25 A   62 P  (Gesamt 13)
 3. Matthias Kraus           RAB  LW  DE     52 Sp  25 T  32 A   57 P  (Gesamt 12)
 4. Kyle McKenzie            MOO  LW  CA     52 Sp  32 T  24 A   56 P  (Gesamt 12)
 5. Thomas Franke            RAB  LD  DE     52 Sp  12 T  42 A   54 P  (Gesamt 12)
 6. Quirin Ebner             OST  C   DE     52 Sp  35 T  18 A   53 P  (Gesamt 13)
 7. Michael Zeller           MOO  C   DE     52 Sp  33 T  20 A   53 P  (Gesamt 13)
 8. Nolan Boucher            FAL  RD  CA     52 Sp  17 T  36 A   53 P  (Gesamt 13)
 9. Stefan Thaler            OST  RW  DE     52 Sp  21 T  31 A   52 P  (Gesamt 12)
10. Thomas Reiter            OST  LD  DE     52 Sp   5 T  47 A   52 P  (Gesamt 12)
11. Felix Riedl              KAL  C   DE     52 Sp  34 T  17 A   51 P  (Gesamt 13)
12. Connor Lavoie            TAN  RW  CA/DE  52 Sp  33 T  18 A   51 P  (Gesamt 13)

Torhüter Hauptrunde (mind. 15 Spiele)
Rastislav Baláž          STU  39 Sp  Fangquote 92,4 %  GAA 2,27  Shutouts 5
Austin Walsh             OST  39 Sp  Fangquote 91,5 %  GAA 2,50  Shutouts 1
Petr Veselý              LIN  39 Sp  Fangquote 91,2 %  GAA 2,76  Shutouts 1
Lukáš Kučera             FAL  39 Sp  Fangquote 90,9 %  GAA 2,56  Shutouts 5
Tim Seitz                KAL  39 Sp  Fangquote 90,9 %  GAA 2,88  Shutouts 3
Kyle MacDonald           BLW  39 Sp  Fangquote 90,7 %  GAA 2,89  Shutouts 2
Tobias Pfeiffer          ROT  39 Sp  Fangquote 90,4 %  GAA 2,98  Shutouts 1
Thomas Seidl             HOM  39 Sp  Fangquote 90,3 %  GAA 2,73  Shutouts 2
Jonas Vogl               RAB  39 Sp  Fangquote 90,2 %  GAA 3,09  Shutouts 3
Tim Reiter               EIS  39 Sp  Fangquote 90,0 %  GAA 3,08  Shutouts 2
```

## Beispielspiel (`pnpm sim match 3`)

```

=== Grünbach Hornets – EHC Kaltenbrunn Eisbrecher ===


00:00     1. Drittel beginnt.
00:17  🚨 TOR für Grünbach Hornets! A. Laine (A. Haas, T. Lackner) – 1:0
01:58  ⏱  Strafe: F. Fischer (GRB) – 2 Minuten wegen Spielverzögerung
06:28  🧤 Starke Parade von J. Fraser gegen D. Hartl!
07:17  ⏱  Strafe: G. Forsberg (KAL) – 2 Minuten wegen Unkorrekter Körperangriff
09:13  🚨 TOR für EHC Kaltenbrunn Eisbrecher! P. Tóth (A. Haas, M. Ostermann) – 1:1 – Unterzahltor
12:13  🚨 TOR für Grünbach Hornets! M. Baláž (T. Lackner, A. Maier) – 2:1
14:40  ⏱  Strafe: M. Hofmann (GRB) – 2 Minuten wegen Haken
16:50  🧤 Starke Parade von J. Fraser gegen J. Wimmer!
20:00     Ende 1. Drittel: GRB 2:1 KAL (Schüsse 11:12)

00:00     2. Drittel beginnt.
04:12  ⏱  Strafe: A. Maier (GRB) – 2 Minuten wegen Haken
05:49  🚨 TOR für Grünbach Hornets! A. Haas (A. Thaler, T. Kellner) – 3:1 – Unterzahltor
06:18  🧤 Starke Parade von J. Fraser gegen D. Hartl!
13:22  ⏱  Strafe: M. Hofmann (GRB) – 2 Minuten wegen Beinstellen
14:23  🚨 TOR für EHC Kaltenbrunn Eisbrecher! G. Forsberg (F. Riedl, O. Dvořák) – 3:2 – Überzahltor
14:59  🧤 Starke Parade von T. Seitz gegen M. Fuchsberger!
17:13  🚨 TOR für EHC Kaltenbrunn Eisbrecher! J. Wimmer (ohne Vorlage) – 3:3
18:55  🚨 TOR für Grünbach Hornets! A. Maier (T. Lackner) – 4:3
20:00     Ende 2. Drittel: GRB 4:3 KAL (Schüsse 7:11)

00:00     3. Drittel beginnt.
05:01  🚨 TOR für Grünbach Hornets! T. Kellner (M. Hofmann, T. Schmid) – 5:3
08:06  ⏱  Strafe: M. Hofmann (GRB) – 2 Minuten wegen Halten des Stocks
10:40  ⏱  Strafe: S. Winkler (KAL) – 2 Minuten wegen Unkorrekter Körperangriff
14:47  🧤 Starke Parade von T. Seitz gegen A. Thaler!
15:22  ⏱  Strafe: S. Becker (GRB) – 2 Minuten wegen Stockschlag
15:54  ⏱  Strafe: G. Forsberg (KAL) – 2 Minuten wegen Unkorrekter Körperangriff
17:50  🧤 Starke Parade von T. Seitz gegen T. Schmid!
18:17  ⏱  Strafe: O. Dvořák (KAL) – 2 Minuten wegen Beinstellen
20:00     Ende 3. Drittel: GRB 5:3 KAL (Schüsse 10:8)

Endstand: GRB 5:3 KAL  (2:1, 2:2, 1:0)

Mannschaftsstatistik                  GRB        KAL
Tore                                    5          3
Schüsse aufs Tor                       28         31
Schussversuche (Corsi)                 68         60
Expected Goals (xG)                  3,17       2,80
Geblockte eigene Schüsse               22         13
Überzahl                              0/4        1/6
Strafminuten                           12          8
Bullys gewonnen                 29 (40 %)  43 (60 %)
Breakout sauber                 66 % (82)  54 % (91)
Zoneneintritt kontrolliert          30/48      24/41
Dump-ins zurückerobert              19/37      10/44
Zeit in Angriffszone                15:42       9:38
Checks                                 23         13
Puckverluste / -gewinne           38 / 29    29 / 38

--- Grünbach Hornets: Reihen (5-gegen-5) ---
Einheit     Eiszeit    Corsi         xG   Tore
Reihe 1       14:14    13:11  0,43:0,58    3:1
Reihe 2       12:44    14:15  0,49:0,80    1:0
Reihe 3        9:49    10:13  0,69:0,48    0:1
Reihe 4        5:41     12:2  0,41:0,04    0:0
Paar 1        16:36    20:12  0,71:0,45    2:1
Paar 2        14:42    18:23  0,95:1,12    1:1
Paar 3        11:10     11:6  0,35:0,34    1:0

Spieler                  Pos  T  A  S/V   +/-  Eiszeit  Schüsse  xG    Bully
Thomas Lackner           C    0  3  1/1    +2    23:34        1  0,09  17/33
Alexander Haas           LW   1  1  3/4    +3    22:57        3  0,23  
Alexander Maier          RW   1  1  2/7    +2    22:33        2  0,65  
Thomas Kellner           LD   1  1  2/3    +1    18:45        2  0,05  
Marek Baláž              LD   1  0  4/12   +2    26:30        4  0,28  
Aleksi Laine             RD   1  0  3/4    +2    26:30        3  0,10  
Thomas Schmid            C    0  1  2/6     0    15:57        2  0,38  4/19
Maximilian Hofmann       RW   0  1  0/1     0    15:23        0  0,02  
Andreas Thaler           C    0  1  1/3    +1    13:52        1  0,14  4/11
Simon Becker             RD   0  0  0/3    -1    17:21        0  0,07  
Leon Fuchsberger         LD   0  0  0/2    +2    16:09        0  0,03  
Thomas Albrecht          LW   0  0  1/3     0    15:57        1  0,15  
Felix Wagner             RD   0  0  2/3     0    14:45        2  0,07  
Michael Fuchsberger      LW   0  0  4/5     0     9:49        4  0,50  
Florian Fischer          RW   0  0  0/0     0     9:49        0  0,00  
Lukas Kerner             LW   0  0  2/5     0     6:37        2  0,18  
Quirin Winkler           C    0  0  0/3     0     6:37        0  0,07  4/9
Moritz Ostermann         RW   0  0  1/3     0     5:41        1  0,16  
Torhüter Jordan Fraser: 28/31 Paraden (90,3 %)

--- EHC Kaltenbrunn Eisbrecher: Reihen (5-gegen-5) ---
Einheit     Eiszeit    Corsi         xG   Tore
Reihe 1       14:16    15:14  0,51:0,40    1:1
Reihe 2       12:50    11:15  0,66:0,77    0:2
Reihe 3        9:30     10:9  0,56:0,32    1:0
Reihe 4        5:52     5:11  0,18:0,52    0:1
Paar 1        16:57    19:23  0,68:0,71    1:2
Paar 2        14:09    11:15  0,60:0,67    1:1
Paar 3        11:22    11:11  0,63:0,63    0:1

Spieler                  Pos  T  A  S/V   +/-  Eiszeit  Schüsse  xG    Bully
Ondřej Dvořák            LD   0  1  5/5    -2    26:42        5  0,10  
Matthias Ostermann       RD   0  1  2/4    -2    25:38        2  0,09  
Felix Riedl              C    0  1  1/4    -1    24:41        1  0,14  19/35
Gustav Forsberg          LW   1  0  4/6    -1    22:46        4  0,41  
Peter Tóth               C    1  0  2/6    -1    22:27        2  0,34  10/15
Andreas Haas             RD   0  1  1/1    +1    17:38        1  0,02  
Johannes Wimmer          LW   1  0  4/6     0    12:47        4  0,39  
Peter Kováč              LD   0  0  1/3     0    24:01        1  0,08  
Leonhard Wimmer          RW   0  0  2/5    -2    19:28        2  0,21  1/3
Sebastian Winkler        LW   0  0  1/4    -3    16:07        1  0,20  
Dominik Hartl            RW   0  0  2/4    -1    16:01        2  0,37  
Michael Mayrhofer        LD   0  0  0/2    -2    14:38        0  0,07  
Stefan Riedl             RD   0  0  0/1    -1    11:22        0  0,02  
Anton Becker             C    0  0  1/2    +1     9:30        1  0,12  6/8
Anton Moser              RW   0  0  2/3    +1     9:30        2  0,10  
Christian Hartl          LW   0  0  1/1    -1     6:31        1  0,02  
Matthias Wimmer          C    0  0  2/3    -1     6:31        2  0,15  7/11
Niklas Fuchsberger       RW   0  0  0/0    -1     5:52        0  0,00  
Torhüter Tim Seitz: 23/28 Paraden (82,1 %)
```
