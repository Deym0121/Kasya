/**
 * WEB report export: open the report in its own window and hand it to the
 * browser's print dialog — "Save as PDF" is the built-in path on every desktop
 * browser, with zero extra dependencies.
 */
export async function exportReport(html: string): Promise<void> {
  const w = window.open('', '_blank');
  if (!w) throw new Error('Pop-up blocked — allow pop-ups to export the report');
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Give the new document a beat to lay out before invoking print.
  await new Promise((r) => setTimeout(r, 250));
  w.focus();
  w.print();
}
