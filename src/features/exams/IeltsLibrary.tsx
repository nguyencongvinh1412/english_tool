/**
 * IeltsLibrary
 * IELTS Academic modes (mini, full) and single parts on the mock tests page
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Banner, Button, Card, Icon, Spinner } from '@/design';
import { useI18n } from '@/i18n/I18nProvider';
import { errorMessage } from '@/shared/http';
import { ieltsApi, type IeltsCatalog, type IeltsMode, type IeltsPart } from '@/shared/ieltsApi';
import { examPath } from './examRoutes';

const PART_TONE: Record<IeltsPart, 'listening' | 'reading' | 'writing' | 'speaking'> = {
  listening: 'listening',
  reading: 'reading',
  'writing-task1': 'writing',
  'writing-task2': 'writing',
  speaking: 'speaking',
};

export const IeltsLibrary: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<IeltsCatalog | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    ieltsApi.catalog().then(setCatalog).catch(setError);
  }, []);

  const start = async (mode: IeltsMode, part?: IeltsPart): Promise<void> => {
    setStarting(part ?? mode);
    setError(null);
    try {
      const { session } = await ieltsApi.start(mode, part);
      navigate(examPath(session.id));
    } catch (err) {
      setError(err);
      setStarting(null);
    }
  };

  if (!catalog) return error !== null ? <Banner tone="danger">{errorMessage(error, t)}</Banner> : <Spinner size={32} label={t.common.loading} />;

  return (
    <>
      {error !== null && <Banner tone="danger">{errorMessage(error, t)}</Banner>}
      {starting && (
        <Banner tone="info">
          {t.ielts.preparing}
        </Banner>
      )}

      <div className="exam-modes">
        <Card padding="lg" className="exam-mode reveal">
          <span className="exam-mode__icon">
            <Icon name="bolt" size={26} />
          </span>
          <h2 className="exam-mode__title">{t.ielts.mini}</h2>
          <p className="exam-mode__body">{t.ielts.miniBody(catalog.modes.mini.minutes)}</p>
          <Button variant="exam" onClick={() => start('mini')} loading={starting === 'mini'} disabled={starting !== null}>
            {t.exams.start}
          </Button>
        </Card>
        <Card padding="lg" className="exam-mode exam-mode--full reveal" style={{ ['--i' as string]: 1 }}>
          <span className="exam-mode__icon">
            <Icon name="exam" size={26} />
          </span>
          <h2 className="exam-mode__title">{t.ielts.full}</h2>
          <p className="exam-mode__body">{t.ielts.fullBody(catalog.modes.full.minutes)}</p>
          <Button variant="exam" onClick={() => start('full')} loading={starting === 'full'} disabled={starting !== null}>
            {t.exams.start}
          </Button>
        </Card>
      </div>

      <section>
        <h2 className="exams__section-title">{t.ielts.byPart}</h2>
        <div className="exam-parts">
          {catalog.parts.map(({ part, minutes }) => (
            <Card key={part} padding="md" className="exam-part">
              <div className="exam-part__head">
                <Badge tone={PART_TONE[part]}>{t.ielts.components[PART_TONE[part]]}</Badge>
              </div>
              <p className="exam-part__title">{t.ielts.partTitles[part]}</p>
              <p className="exam-part__meta">
                {t.ielts.partBody[part]} · {t.ielts.partMinutes(minutes)}
              </p>
              <Button size="sm" variant="secondary" onClick={() => start('part', part)} loading={starting === part} disabled={starting !== null}>
                {t.exams.start}
              </Button>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
};
