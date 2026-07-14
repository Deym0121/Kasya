/**
 * NATIVE report export: expo-print renders the HTML to a real PDF file, then
 * expo-sharing opens the system sheet. Metro picks exportReport.web.ts on web.
 * Native modules are lazy-required so nothing loads until the user exports.
 */
export async function exportReport(html: string): Promise<void> {
  const Print = require('expo-print');
  const { uri } = await Print.printToFileAsync({ html });
  const Sharing = require('expo-sharing');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share your StrideFit report' });
  }
}
