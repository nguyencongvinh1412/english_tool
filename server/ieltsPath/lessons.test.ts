import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pathLessonContent } from './lessons.js';
import { LESSONS } from './syllabus.js';

const DIR = path.resolve(process.cwd(), 'server/content/en/ielts-path');

describe('IELTS path lesson drafts', () => {
  it('has a valid draft for every lesson, and no others', async () => {
    const files = (await readdir(DIR)).filter((f) => f.endsWith('.json'));
    expect(files.map((f) => f.replace('.json', '')).sort()).toEqual(LESSONS.map((l) => l.id).sort());
    for (const file of files) {
      const content = pathLessonContent.parse(JSON.parse(await readFile(path.join(DIR, file), 'utf8')));
      expect(content.drills.some((d) => d.type === 'order'), file).toBe(true);
    }
  });
});
