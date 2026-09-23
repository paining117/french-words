import test from 'node:test';
import assert from 'node:assert/strict';
import { definiteArticle, wordWithArticle } from '../src/utils/wordLabel';

test('noun article labels follow stored gender without changing spelling or inventing missing gender', () => {
  assert.equal(wordWithArticle({ lemma: 'livre', partOfSpeech: 'noun', gender: 'm' }), 'le · livre');
  const school = { lemma: 'école', partOfSpeech: 'noun', gender: 'f' as const };
  assert.equal(wordWithArticle(school), 'la · école');
  assert.equal(school.lemma, 'école');
  assert.equal(wordWithArticle({ lemma: 'élève', partOfSpeech: 'noun' }), 'élève');
  assert.equal(wordWithArticle({ lemma: 'belle', partOfSpeech: 'adjective', gender: 'f' }), 'belle');
  assert.equal(definiteArticle(undefined, 'm'), undefined);
});
