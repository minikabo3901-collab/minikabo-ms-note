/**
 * アプリ名などの識別情報はこのファイル 1 箇所だけで管理する。
 * 名称を変更する場合は APP_NAME / APP_SHORT_NAME / APP_ID を書き換えるだけでよい
 * （manifest・タイトル・レポート見出し・バックアップファイル名がすべて追従する）。
 */
export const APP_NAME = 'みにかぼ MSノート';
export const APP_SHORT_NAME = 'MSノート';
export const APP_DESCRIPTION = '多発性硬化症の記録を端末内だけで管理する個人用アプリ';

/** IndexedDB 名・バックアップファイル名などに使う ASCII 識別子 */
export const APP_ID = 'minikabo-ms-note';

/** バックアップの独自拡張子 */
export const BACKUP_EXTENSION = '.msbackup';

/** テーマカラー（manifest と meta タグの両方で使用） */
export const THEME_COLOR = '#0e7490';
export const BACKGROUND_COLOR = '#f6f9fb';

/** 医療上の免責文（初回起動時と設定画面に表示） */
export const DISCLAIMER_TEXT =
  'このアプリは個人の記録を目的としており、診断や治療判断を行うものではありません。' +
  '急激または強い症状がある場合は、アプリの表示を待たず医療機関へ相談してください。';
