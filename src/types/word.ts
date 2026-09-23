export interface Word {
  id: string;
  lemma: string;
  normalized_lemma: string;
  display_form: string | null;
  part_of_speech: string | null;
  gender: 'm' | 'f' | null;
  primary_meaning_zh: string;
  cefr_level: string | null;
  source: string;
  source_ref: string | null;
  created_at: string;
}
export interface WordBook {
  id: string;
  name: string;
  level: string | null;
  description: string | null;
  built_in: number;
  created_at: string;
}
export interface BookProgress extends WordBook { total: number; learned: number }
export interface SeedWord {
  lemma: string;
  displayForm?: string;
  partOfSpeech: string;
  gender?: 'm' | 'f';
  meaningsZh: string[];
  examples?: { french: string; chinese: string }[];
}
export interface SeedBook {
  id: string;
  name: string;
  level?: string;
  description?: string;
  words: SeedWord[];
}
