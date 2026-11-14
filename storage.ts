export interface ScoreEntry {
  name: string;
  score: number;
  length: number;
  level: number;
  date: string;
}

const KEY = 'neon-serpent-scores-v1';
const NAME_KEY = 'neon-serpent-name';
const MAX = 8;

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScoreEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => typeof s?.score === 'number').slice(0, MAX);
  } catch {
    return [];
  }
}

export function qualifies(score: number): boolean {
  if (score <= 0) return false;
  const scores = loadScores();
  if (scores.length < MAX) return true;
  return score > scores[scores.length - 1].score;
}

export function saveScore(entry: ScoreEntry): ScoreEntry[] {
  const scores = [...loadScores(), entry].sort((a, b) => b.score - a.score).slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(scores)); } catch { /* ignore */ }
  return scores;
}

export function bestScore(): number {
  const s = loadScores();
  return s.length ? s[0].score : 0;
}

export function lastName(): string {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
export function saveName(name: string) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
}
