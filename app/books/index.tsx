import { useCallback } from 'react';
import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getBooks, VOCABULARY_BOOK_ID } from '../../src/repositories/wordBookRepository';
import { getSettings } from '../../src/repositories/settingsRepository';
import { useResource } from '../../src/hooks/useResource';
import { PageTitle, Screen, commonStyles } from '../../src/components/common/Screen';
import { LoadState } from '../../src/components/common/LoadState';
export default function BooksScreen() {
  const db = useSQLiteContext();
  const { state, refresh } = useResource(useCallback(async () => ({ books: await getBooks(db), settings: await getSettings(db) }), [db]));
  return <Screen><PageTitle title="我的词书" />
    {state.status === 'ready' ? state.data.books.map(book => <Pressable accessibilityRole="button" key={book.id} style={commonStyles.row} onPress={() => router.push({ pathname: '/books/[id]', params: { id: book.id } })}><Text style={commonStyles.text}>{book.name}{state.data.settings.currentBookId === book.id ? ' · 当前词书' : ''}</Text><Text style={commonStyles.muted}>{book.id === VOCABULARY_BOOK_ID ? `${book.total} 个词 · 已学习 ${book.learned}` : `${book.learned} / ${book.total} 个词`}</Text></Pressable>) : <LoadState inline error={state.status === 'error'} retry={() => void refresh()} />}
  </Screen>;
}