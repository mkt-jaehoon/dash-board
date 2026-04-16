export function parseApiResponse<T>(response: Response): Promise<T> {
  return response.text().then((text) => {
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(text || `요청 실패 (${response.status})`);
    }
  });
}

export function formatTimestamp(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR");
}

export function safeDiv(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}
