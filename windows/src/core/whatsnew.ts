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
    title: "De grote upstream-update",
    date: "21 oktober 2026",
    items: [
      "Een klok in het midden van het eiland: datum en tijd, alleen zichtbaar als het eiland klein is. Standaard uit; zet hem aan bij Instellingen, Algemeen, Eiland-gedrag.",
      "Coucou praat nu ook Duits en Turks.",
      "Elke pil mag het eiland openen als er iets af is of misgaat, niet alleen Claude Code. Claude Desktop laat Mochi springen als een antwoord klaar is.",
      "Op Linux zit Coucou minder aan je processor, en het instellingenscherm stopt met bewegen als het niet in beeld is.",
      "Nieuw erbij: GitLab- en Gitea-overzichten, een WhatsApp-pil, Conductor-sessies op de Claude Code-pil en vragen van Antigravity als melding.",
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
