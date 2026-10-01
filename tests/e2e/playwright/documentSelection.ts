import type { Page } from "@playwright/test";

/** Selects text in a rendered document the way a mouse drag ends, so the page offers to comment on it. */
export async function selectText(page: Page, from: string, to: string): Promise<void> {
  await page.evaluate(
    ([start, end]) => {
      const nodes: Text[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node instanceof Text && node.parentElement?.closest("[data-src-start]")) nodes.push(node);
      }
      const first = nodes.find((node) => node.data.includes(start));
      const last = nodes.find((node) => node.data.includes(end));
      if (!first || !last) throw new Error(`"${start}"…"${end}" isn't in the document`);
      const range = document.createRange();
      range.setStart(first, first.data.indexOf(start));
      range.setEnd(last, last.data.indexOf(end) + end.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      last.parentElement?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    },
    [from, to],
  );
}
