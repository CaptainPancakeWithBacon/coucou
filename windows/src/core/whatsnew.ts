// What changed in each release, newest first, for the "What's changed?" page.
// Written for the friends who use this fork, so in Dutch. Add an entry at the top
// with every release.

export interface WhatsNewEntry {
  title: string;
  date: string;
  items: string[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    title: "Mini-update: Y en N",
    date: "23 oktober 2026",
    items: [
      "Een toestemmingskaart beantwoord je nu met de toets Y (toestaan) of N (weigeren), zodra het eiland het toetsenbord heeft: klik op de kaart, of druk Ctrl+Alt+A om hem te openen. Zonder dat doet een losse Y of N niets, zodat er nooit per ongeluk iets wordt goedgekeurd.",
      "Linux: meldingen van je telefoon via GSConnect kun je nu per telefoon-app dempen, onder Instellingen, Meldingen. Zo laat je WhatsApp wel door en Snapchat niet, net als bij Phone Link.",
    ],
  },
  {
    title: "Mini-update: eilandkleur",
    date: "23 oktober 2026",
    items: [
      "Nieuw: de kleur van het eiland. Bij Instellingen, Algemeen, Eilandkleur kies je zwart (zoals altijd), Systeemkleur (een donkere tint van de accentkleur van je systeem) of een eigen kleur. De kleur blijft altijd donker genoeg, zodat Mochi goed zichtbaar blijft.",
      "Linux: meldingen van apps in een sandbox (zoals een Flatpak-WhatsApp) en van GSConnect komen nu ook in het eiland.",
    ],
  },
  {
    title: "Mini-update: meldingen van elke pil",
    date: "21 oktober 2026",
    items: [
      "Nieuw, standaard uit: bij Instellingen, Algemeen, Eiland-gedrag kun je \"Openen voor de meldingen van elke pil\" aanzetten. Is een andere pil dan de getoonde klaar of loopt er iets mis, dan opent het eiland op zijn kaartje, en daarna komt de pil terug die je zag. Nooit over een goedkeuring of vraag heen.",
      "Nieuw, experimenteel en standaard uit (Windows): bij Instellingen, Agents zet je \"Claude Desktop-chats\" aan. Verlaat je de Claude-app terwijl hij nog schrijft, dan springt Mochi zodra het antwoord klaar is. Coucou kijkt alleen of de stopknop in beeld is, nooit naar de tekst van je chat.",
    ],
  },
  {
    title: "De grote upstream-update",
    date: "21 oktober 2026",
    items: [
      "Een klok in het midden van het eiland: datum en tijd, alleen zichtbaar als het eiland klein is. Standaard uit; zet hem aan bij Instellingen, Algemeen, Eiland-gedrag.",
      "Coucou praat nu ook Duits en Turks.",
      "Op Linux zit Coucou minder aan je processor, en het instellingenscherm stopt met bewegen als het niet in beeld is.",
      "Nieuw erbij: GitLab- en Gitea-overzichten (je hebt een token nodig) en vragen van Antigravity als melding.",
      "Updaten blijft zoals je gewend bent: één klik op Nu bijwerken.",
    ],
  },
  {
    title: "Mini-update",
    date: "19 oktober 2026",
    items: [
      "Updaten kan nu met één klik: bij een nieuwe versie drukt Coucou zelf de installatie door en start daarna opnieuw op. Na een update zie je deze pagina vanzelf.",
      "Een melding verdwijnt niet meer in een vreemde Sessie-klaar-kaart: na de melding gaat het eiland gewoon terug naar het normale scherm.",
      "In de instellingen staat naast Controleren op updates nu een knop Nu bijwerken, grijs tot er een nieuwe versie is.",
    ],
  },
  {
    title: "De Merijn-special",
    date: "19 oktober 2026",
    items: [
      "Merijn heeft een compleet nieuwe garderobe gemaakt: drie collecties erbij (Extra, League of Legends en Overwatch), met kleurvarianten en een garderobeknop bovenaan het eiland.",
      "Mochi danst beter op Spotify. Op Windows luistert hij alleen naar Spotify zelf (niet naar je microfoon), onthoudt het tempo als je pauzeert en je kunt kiezen via welke uitgang hij luistert.",
      "Het eiland is van jou: een knop om het langs de bovenkant te slepen (Windows), een transparantieschuif en netter inklappen en hoveren.",
      "Acht pillen in plaats van vier, in twee pagina's. Codex en Copilot laten meer details zien.",
      "Niet storen: een belletje bovenin het eiland en een schakelaar op de Meldingenpagina. Zolang die aan staat laat het eiland geen enkele melding zien.",
      "Het volume van Spotify werkt als Coucou Spotify zelf start (Open Spotify). Is het balkje grijs, dan kan Coucou er niet bij.",
    ],
  },
  {
    title: "De opruimronde",
    date: "16 oktober 2026",
    items: [
      "Meldingen hebben een eigen pagina: zet ze aan of uit, ook per app, en bij Phone Link per telefoon-app.",
      "Het eiland staat links, in het midden of rechts, en Codex koppelt zichzelf.",
      "Dictate is verwijderd, en het instellingenscherm springt niet meer open bij het opstarten.",
      "Mochi blijft in beeld als er niks gebeurt, tenzij je dat zelf uitzet.",
      "Er is een knop Controleren op updates, en het updatebericht blijft open en komt elke dag terug tot je bijgewerkt hebt.",
    ],
  },
];
