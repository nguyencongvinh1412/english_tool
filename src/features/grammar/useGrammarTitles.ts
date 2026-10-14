/**
 * Titles of the grammar points by id, loaded once, for links from other pages
 */
import { useEffect, useState } from 'react';
import { grammarApi, type Bilingual } from '@/shared/grammarApi';

let cache: Promise<Map<string, Bilingual>> | null = null;

const load = () => {
  cache ??= grammarApi
    .map()
    .then((map) => new Map(map.points.map((p) => [p.id, p.title])))
    .catch(() => {
      cache = null;
      return new Map<string, Bilingual>();
    });
  return cache;
};

export function useGrammarTitles(): Map<string, Bilingual> {
  const [titles, setTitles] = useState<Map<string, Bilingual>>(new Map());
  useEffect(() => {
    let active = true;
    void load().then((loaded) => active && setTitles(loaded));
    return () => {
      active = false;
    };
  }, []);
  return titles;
}
