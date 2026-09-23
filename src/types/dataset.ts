export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export interface DatasetExample { french: string; chinese: string; source: 'tatoeba'; sourceRef: string; attribution?: string }
export interface DatasetWord {
  id: string; lemma: string; normalizedLemma: string; searchKey: string;
  partOfSpeech: string; gender?: 'm' | 'f'; homograph: string;
  meaningsZh: string[]; displayForm?: string; cefrLevel?: CefrLevel;
  properNoun?: boolean; source: 'freedict'; sourceRef: string; examples: DatasetExample[];
}
export interface DatasetBook { id: string; name: string; level: 'A1' | 'A2' | 'B1' | 'B2'; wordIds: string[] }
export interface DatasetBundle { version: string; books: DatasetBook[]; chunks: (() => DatasetWord[])[] }
