// Notes de version affichées dans la modale « Quoi de neuf » après une mise à
// jour. À maintenir à chaque release : ajoute une entrée en tête de liste.
// Garde des puces courtes et orientées bénéfice utilisateur.

export type WhatsNewEntry = {
  version: string;
  date: string;
  title: string;
  items: string[];
};

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: "1.0.2",
    date: "2026-05-25",
    title: "Démarrage blindé",
    items: [
      "Plus jamais de crash au lancement après une mise à jour — les migrations se réparent toutes seules.",
      "Les erreurs de démarrage affichent un message clair au lieu de fermer l'app en silence.",
      "Nouveau : cette fenêtre « Quoi de neuf » à chaque mise à jour 🎉",
    ],
  },
];

/** Compare deux versions « x.y.z ». Retourne >0 si a > b, <0 si a < b, 0 sinon. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/** Entrées strictement plus récentes que `seen` (la version déjà connue). */
export function whatsNewSince(seen: string): WhatsNewEntry[] {
  return WHATS_NEW.filter((e) => compareVersions(e.version, seen) > 0);
}
