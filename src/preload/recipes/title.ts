export function unreadFromTitle(title: string): number {
  const m = title.match(/\((\d+)\)/);
  return m ? Number.parseInt(m[1], 10) : 0;
}
