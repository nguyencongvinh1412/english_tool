import { describe, expect, it } from 'vitest';
import { mapIntent } from './intent';

describe('mapIntent', () => {
  it('recognises a request to create a map', () => {
    expect(mapIntent('vẽ sơ đồ tư duy về các thì')).toBe('topic');
    expect(mapIntent('Create a mind map of conditionals')).toBe('topic');
    expect(mapIntent('Tạo diagram cho câu bị động')).toBe('topic');
  });

  it('recognises one based on what was learned', () => {
    expect(mapIntent('dựa vào những gì tôi đã học, tạo sơ đồ giúp tôi')).toBe('learned');
    expect(mapIntent('make a mind map based on what I have learned')).toBe('learned');
  });

  it('recognises a request to update a map', () => {
    expect(mapIntent('cập nhật lại sơ đồ của tôi theo những gì đã học')).toBe('update');
    expect(mapIntent('please update my mind map')).toBe('update');
  });

  it('leaves ordinary questions alone', () => {
    expect(mapIntent('Khi nào dùng would thay vì will?')).toBeNull();
    expect(mapIntent('What is a sentence diagram?')).toBeNull();
    expect(mapIntent('tạo câu với present perfect')).toBeNull();
  });
});
