export function chunkText(text: string, maxLength: number = 4500): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = i + maxLength;
    if (end < text.length) {
      let breakPoint = text.lastIndexOf('\n', end);
      if (breakPoint <= i) breakPoint = text.lastIndexOf('. ', end);
      if (breakPoint > i) {
        end = breakPoint + 1;
      }
    }
    chunks.push(text.substring(i, end).trim());
    if (end >= text.length) break;

    let nextI = end - 250;
    let bLine = text.lastIndexOf('\n', end);
    let bDot = text.lastIndexOf('. ', end);
    let boundary = bLine >= end - 150 ? bLine : (bDot >= end - 150 ? bDot : -1);
    
    if (boundary > nextI && boundary < end) {
      nextI = boundary + 1;
    }
    if (nextI <= i) nextI = end;
    i = nextI;
  }
  return chunks.filter(c => c.length > 0);
}
