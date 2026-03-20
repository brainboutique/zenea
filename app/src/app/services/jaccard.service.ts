import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class JaccardService {
  /** Jaccard similarity: |A ∩ B| / |A ∪ B|. Returns 0 if both sets are empty. */
  similarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    const intersection = [...a].filter((x) => b.has(x)).length;
    const union = new Set([...a, ...b]).size;
    return union === 0 ? 0 : intersection / union;
  }
}
