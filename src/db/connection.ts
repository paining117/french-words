import type { SQLiteDatabase } from 'expo-sqlite';

// The same repository contract is exercised against real SQLite in Node tests.
export type Connection = Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;
export interface Database extends Connection {
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  withExclusiveTransactionAsync(task: (transaction: Connection) => Promise<void>): Promise<void>;
}
