import type { MouseEvent } from "react";

export function scrollToSection(sectionId: string) {
  const id = sectionId.replace(/^#/, "");
  const el = document.getElementById(id);
  if (!el) return;

  el.scrollIntoView({ behavior: "smooth", block: "start" });

  const { pathname, search } = window.location;
  window.history.replaceState(null, "", pathname + search);
}

export function handleSectionNav(
  e: MouseEvent<HTMLAnchorElement>,
  sectionId: string
) {
  e.preventDefault();
  scrollToSection(sectionId);
}
