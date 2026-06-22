// Canonical, predefined site list. This is the single source of truth for the
// sites we always want offered in the Site pick-or-add dropdown (employee form)
// and the Site filter on the list page — even before any employee has been
// assigned a given site. Distinct DB values get unioned in alongside these.
export const SITE_OPTIONS = [
  "Main office",
  "Various properties",
  "2274 Princess",
  "The Sante",
  "Eagle Point",
  "Construction office",
  "Construction office (Westgate)",
  "Ottawa",
  "Remote",
  "Frontenac Mall",
  "2314 Princess",
  "800 Princess",
  "544 College",
  "150 Marketplace",
  "180 Kanata",
  "Theberge Office",
  "Various sites",
] as const;
