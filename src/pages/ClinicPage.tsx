import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppShell } from '@/components/AppShell';
import { Badge, Card, ConfirmSheet, EmptyState, TextAreaField } from '@/components/ui';
import { useToast } from '@/components/SaveToast';
import { questions } from '@/db/repo';
import { formatDateJa, isoDateOfDateTime } from '@/lib/date';

export function ClinicPage(): ReactNode {
  return (
    <AppShell title="診察">
      <ul className="list">
        <li>
          <Link className="list__item" to="/clinic/questions">
            <div className="list__item-title">質問メモ</div>
            <div className="list__item-meta">診察で聞きたいことを書き留めておきます</div>
          </Link>
        </li>
        <li>
          <Link className="list__item" to="/clinic/report">
            <div className="list__item-title">診察用レポート</div>
            <div className="list__item-meta">期間を選んで、記録をまとめて確認・印刷・PDF保存します</div>
          </Link>
        </li>
        <li>
          <Link className="list__item" to="/appointments">
            <div className="list__item-title">次回診察・検査の予定</div>
            <div className="list__item-meta">アプリ内だけで管理します</div>
          </Link>
        </li>
        <li>
          <Link className="list__item" to="/medical">
            <div className="list__item-title">医療履歴</div>
            <div className="list__item-meta">診察・MRI・血液検査・治療などの記録</div>
          </Link>
        </li>
      </ul>
    </AppShell>
  );
}

/* ---------------------------------------------------------- 質問メモ */

export function QuestionsPage(): ReactNode {
  const toast = useToast();
  const rows = useLiveQuery(() => questions.all(), []);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const add = async (): Promise<void> => {
    if (!text.trim()) return;
    await questions.create({ text, asked: false, askedAt: null, answer: '', repeat: false });
    setText('');
    toast.notify('保存しました');
  };

  const open = rows?.filter((q) => !q.asked) ?? [];
  const asked = rows?.filter((q) => q.asked) ?? [];

  return (
    <AppShell title="質問メモ" back>
      <Card title="質問を追加">
        <TextAreaField
          label="質問内容"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          placeholder="診察で聞きたいことを書きます"
        />
        <button type="button" className="btn btn--primary btn--block" onClick={() => void add()}>
          追加する
        </button>
      </Card>

      <Card title={`未質問（${open.length}件）`}>
        {open.length === 0 ? (
          <EmptyState>未質問の項目はありません。</EmptyState>
        ) : (
          <ul className="list">
            {open.map((q) => (
              <li key={q.id}>
                <div className="list__item">
                  <div style={{ whiteSpace: 'pre-wrap' }}>{q.text}</div>
                  <div className="list__item-meta">
                    作成 {formatDateJa(isoDateOfDateTime(q.createdAt))}
                    {q.repeat ? ' ／ 次回も確認' : ''}
                  </div>
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setEditing(q.id);
                        setAnswer(q.answer);
                      }}
                    >
                      質問済みにする
                    </button>
                    <button
                      type="button"
                      className="btn"
                      aria-pressed={q.repeat}
                      onClick={() => void questions.update(q.id, { repeat: !q.repeat })}
                    >
                      {q.repeat ? '次回も確認：オン' : '次回も確認：オフ'}
                    </button>
                    <button type="button" className="btn btn--danger" onClick={() => setConfirmDelete(q.id)}>
                      削除
                    </button>
                  </div>
                  {editing === q.id ? (
                    <div style={{ marginTop: 10 }}>
                      <TextAreaField
                        label="医師の回答（任意）"
                        value={answer}
                        onChange={(e) => setAnswer(e.currentTarget.value)}
                      />
                      <div className="btn-row">
                        <button type="button" className="btn" onClick={() => setEditing(null)}>
                          キャンセル
                        </button>
                        <button
                          type="button"
                          className="btn btn--primary"
                          onClick={() =>
                            void questions
                              .update(q.id, { asked: true, askedAt: new Date().toISOString(), answer })
                              .then(() => {
                                setEditing(null);
                                toast.notify('保存しました');
                              })
                          }
                        >
                          保存する
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`質問済み（${asked.length}件）`}>
        {asked.length === 0 ? (
          <EmptyState>まだありません。</EmptyState>
        ) : (
          <ul className="list">
            {asked.map((q) => (
              <li key={q.id}>
                <div className="list__item">
                  <div className="row row--between row--wrap">
                    <span style={{ whiteSpace: 'pre-wrap' }}>{q.text}</span>
                    <Badge tone="ok">質問済み</Badge>
                  </div>
                  {q.answer ? (
                    <div className="small" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
                      回答：{q.answer}
                    </div>
                  ) : null}
                  <div className="btn-row" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void questions.update(q.id, { asked: false, askedAt: null })}
                    >
                      未質問に戻す
                    </button>
                    <button type="button" className="btn btn--danger" onClick={() => setConfirmDelete(q.id)}>
                      削除
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {confirmDelete ? (
        <ConfirmSheet
          title="この質問を削除しますか"
          message="この操作は取り消せません。"
          confirmLabel="削除する"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            void questions.remove(confirmDelete).then(() => {
              setConfirmDelete(null);
              toast.notify('削除しました');
            });
          }}
        />
      ) : null}
    </AppShell>
  );
}
