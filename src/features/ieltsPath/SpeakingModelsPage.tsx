/**
 * SpeakingModelsPage
 * Model speaking answers of a book, by topic: the list of topics (grouped, with a search box) and, for one topic, its
 * questions of Parts 1 to 3 with the model answer behind a button, and the vocabulary. Study material, not a test.
 */
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "@/design";
import { useI18n } from "@/i18n/I18nProvider";
import { ROUTES } from "@/app/routes";
import {
  ieltsPathApi,
  type SpeakingModel,
  type SpeakingModelSummary,
} from "@/shared/ieltsPathApi";
import "./ieltsPath.css";

const TopicList: React.FC<{ topics: SpeakingModelSummary[] }> = ({
  topics,
}) => {
  const { t } = useI18n();
  const m = t.ieltsPath.speakingModels;
  const [query, setQuery] = useState("");
  const shown = useMemo(
    () =>
      topics.filter((x) =>
        `${x.group} ${x.topic}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [topics, query],
  );
  return (
    <>
      <input
        type="search"
        className="input"
        value={query}
        placeholder={m.search}
        aria-label={m.search}
        onChange={(e) => setQuery(e.target.value)}
      />
      {shown.length === 0 ? (
        <p className="create__muted">{m.none}</p>
      ) : (
        <ul className="spmodels__list">
          {shown.map((x) => (
            <li key={x.id}>
              <Link
                to={`${ROUTES.IELTS_SPEAKING_MODELS}/${x.id}`}
                className="spmodels__topic"
              >
                <strong>{x.topic}</strong>
                <span className="create__muted">
                  {m.counts(x.counts[1], x.counts[2], x.counts[3])}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

const Answer: React.FC<{ item: SpeakingModel["items"][number] }> = ({
  item,
}) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Card padding="md" className="spmodels__qa">
      <p lang="en" className="spmodels__question">
        <strong>{item.question}</strong>
      </p>
      {open ? (
        <p lang="en" className="spmodels__answer">
          {item.answer}
        </p>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          {t.ieltsPath.speakingModels.showAnswer}
        </Button>
      )}
    </Card>
  );
};

const TopicView: React.FC<{ topic: SpeakingModel }> = ({ topic }) => {
  const { t } = useI18n();
  const m = t.ieltsPath.speakingModels;
  return (
    <>
      <p className="create__muted">{m.note}</p>
      {([1, 2, 3] as const).map((part) => {
        const items = topic.items.filter((i) => i.part === part);
        return items.length === 0 ? null : (
          <section key={part} className="spmodels__part">
            <h2>{m.part(part)}</h2>
            {items.map((item, i) => (
              <Answer key={i} item={item} />
            ))}
          </section>
        );
      })}
      {topic.vocab.length > 0 && (
        <Card padding="lg">
          <h2>{m.vocabTitle}</h2>
          <ul className="spmodels__vocab" lang="en">
            {topic.vocab.map((word, i) => (
              <li key={i}>{word}</li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
};

const LoadFailed: React.FC = () => {
  const { t } = useI18n();
  return (
    <ErrorState
      title={t.ieltsPath.speakingModels.loadError}
      action={
        <Button variant="secondary" onClick={() => window.location.reload()}>
          {t.ieltsPath.retry}
        </Button>
      }
    />
  );
};

const Header: React.FC<{
  title: string;
  intro?: string;
  to: string;
  back: string;
}> = ({ title, intro, to, back }) => (
  <header className="errbook__head">
    <h1>{title}</h1>
    {intro && <p className="create__muted">{intro}</p>}
    <Link to={to} className="stage__more">
      {back}
    </Link>
  </header>
);

const TopicPage: React.FC<{ id: string }> = ({ id }) => {
  const { t } = useI18n();
  const [topic, setTopic] = useState<SpeakingModel | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    ieltsPathApi
      .speakingModel(id)
      .then((r) => active && setTopic(r.topic))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [id]);
  if (failed) return <LoadFailed />;
  if (!topic) return <Skeleton height={160} label={t.common.loading} />;
  return (
    <div className="spmodels">
      <Header
        title={topic.topic}
        to={ROUTES.IELTS_SPEAKING_MODELS}
        back={t.ieltsPath.speakingModels.back}
      />
      <TopicView topic={topic} />
    </div>
  );
};

const ListPage: React.FC = () => {
  const { t } = useI18n();
  const m = t.ieltsPath.speakingModels;
  const [topics, setTopics] = useState<SpeakingModelSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    ieltsPathApi
      .speakingModels()
      .then((r) => active && setTopics(r.topics))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);
  if (failed) return <LoadFailed />;
  if (!topics) return <Skeleton height={160} label={t.common.loading} />;
  return (
    <div className="spmodels">
      <Header
        title={m.title}
        intro={m.intro}
        to={ROUTES.IELTS_PATH}
        back={m.backToPath}
      />
      {topics.length === 0 ? (
        <EmptyState icon="sparkles" title={m.title}>
          {m.empty}
        </EmptyState>
      ) : (
        <TopicList topics={topics} />
      )}
    </div>
  );
};

export const SpeakingModelsPage: React.FC = () => {
  const { topicId } = useParams();
  return topicId ? <TopicPage key={topicId} id={topicId} /> : <ListPage />;
};
