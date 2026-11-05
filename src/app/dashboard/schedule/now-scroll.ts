/**
 * Brings the timeline's red now line into view: sideways inside the plan and, if asked, the page
 * itself. Returns false when there is no line (another day, or outside working hours).
 */
export function scrollToNowLine(page: boolean): boolean {
  const line = document.querySelector<HTMLElement>("[data-now-line]");
  const box = line?.closest<HTMLElement>("[data-timeline-scroll]");
  if (!line || !box) return false;
  box.scrollLeft = Math.max(0, line.offsetLeft - box.clientWidth / 2);
  if (page) box.scrollIntoView({ block: "start" });
  return true;
}
