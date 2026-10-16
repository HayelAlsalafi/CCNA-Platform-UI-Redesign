import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, BookOpen, ChevronRight, Layers3, X } from "lucide-react";
import {
  getCurriculum,
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
  useGetLearningProgress,
  adminContentRequest,
  type CurriculumSummary,
  type CurriculumMappingReport,
  type LearningTopicProgress,
} from "@workspace/api-client-react";
import {
  progressIdentity,
  sessionQueryKey,
  learningProgressOptions,
} from "../lib/learning-progress-cache";
import "../curriculum.css";

export function CurriculumView({
  data,
  progress,
  admin = false,
  onSelectChapter,
}: {
  data: CurriculumSummary;
  progress?: LearningTopicProgress[];
  admin?: boolean;
  onSelectChapter?: () => void;
}) {
  const [domainId, setDomainId] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  const domain = data.domains.find((d) => d.id === domainId);
  const chapters = domain?.sections.flatMap((s) => s.chapters) ?? [];
  const chapter = chapters.find((c) => c.id === chapterId);
  const topics = data.topics.filter(
    (t) => t.status === "ACTIVE" && t.chapterIds.includes(chapterId ?? ""),
  );
  const close = () => {
    setDomainId(null);
    setChapterId(null);
    selectedButton.current?.focus();
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && domainId) close();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [domainId]);
  return (
    <>
      <div className="curriculum-grid" aria-label="Six CCNA domains">
        {data.domains.map((d) => {
          const domainChapters = d.sections.flatMap((s) => s.chapters);
          const domainTopics = data.topics.filter(
            (t) =>
              t.status === "ACTIVE" &&
              t.chapterIds.some((id) => domainChapters.some((c) => c.id === id)),
          );
          return (
            <button
              key={d.id}
              type="button"
              className="curriculum-domain"
              aria-expanded={domainId === d.id}
              aria-controls="curriculum-panel"
              onClick={(event) => {
                selectedButton.current = event.currentTarget;
                if (domainId === d.id) close();
                else {
                  setDomainId(d.id);
                  setChapterId(null);
                }
              }}
            >
              <span className="curriculum-domain-top">
                <span>DOMAIN {d.number}</span>
                <ChevronRight size={18} aria-hidden="true" />
              </span>
              <h2>{d.title}</h2>
              <p>{d.description}</p>
              <span className="curriculum-domain-meta">
                <span>{domainChapters.length} chapters</span>
                <span>
                  {domainTopics.reduce((n, t) => n + t.questionCount, 0)} published questions
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {domain ? (
        <section
          id="curriculum-panel"
          className="curriculum-panel"
          aria-label={domain.title + " chapters"}
        >
          <header>
            <div>
              <span className="curriculum-kicker">DOMAIN {domain.number}</span>
              <h2>{domain.title}</h2>
            </div>
            <button
              type="button"
              className="button-quiet"
              aria-label="Collapse domain"
              onClick={close}
            >
              <X size={16} /> Collapse
            </button>
          </header>
          <div className="curriculum-panel-body">
            <nav className="curriculum-chapters" aria-label="Sections and chapters">
              {domain.sections.map((s) => (
                <section key={s.id}>
                  <h3>{s.title}</h3>
                  {s.chapters.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      aria-pressed={chapterId === c.id}
                      onClick={() => {
                        setChapterId(c.id);
                        onSelectChapter?.();
                      }}
                    >
                      <span>
                        {String(chapters.findIndex((item) => item.id === c.id) + 1).padStart(
                          2,
                          "0",
                        )}
                      </span>
                      {c.title}
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  ))}
                </section>
              ))}
            </nav>
            <article className="curriculum-details" aria-live="polite">
              {chapter ? (
                <>
                  <span className="curriculum-kicker">CHAPTER / LEARNING NAVIGATION</span>
                  <h3>{chapter.title}</h3>
                  <p>{chapter.description}</p>
                  <div className="curriculum-detail-summary">
                    <span>
                      <BookOpen size={15} />
                      {topics.reduce((n, t) => n + t.questionCount, 0)} published questions
                    </span>
                    <span>Labs coming soon</span>
                  </div>
                  {!topics.length ? (
                    <div className="curriculum-empty">
                      <h4>No topics available yet</h4>
                      <p>No questions available yet</p>
                      <button disabled className="button-quiet">
                        Start Practice
                      </button>
                    </div>
                  ) : (
                    <ul className="curriculum-topic-list">
                      {topics.map((t) => {
                        const metric = progress?.find((p) => p.topicId === t.id);
                        return (
                          <li key={t.id}>
                            <h4>{t.name}</h4>
                            <p>{t.description}</p>
                            <div className="curriculum-topic-meta">
                              <span>{t.questionCount} published questions</span>
                              <span>
                                {metric
                                  ? `${metric.coveredQuestionCount} of ${metric.availableQuestionCount} available questions attempted (${metric.coveragePercent}% coverage)`
                                  : "Learning progress unavailable"}
                              </span>
                            </div>
                            <div className="curriculum-actions">
                              {t.questionCount > 0 ? (
                                <Link
                                  className="button-primary"
                                  href={"/practice?topicId=" + encodeURIComponent(t.id)}
                                >
                                  Start Practice <ArrowRight size={14} />
                                </Link>
                              ) : (
                                <>
                                  <span>No questions available yet</span>
                                  <button disabled className="button-quiet">
                                    Start Practice
                                  </button>
                                </>
                              )}
                              {admin ? (
                                <Link
                                  className="button-quiet"
                                  href={"/admin/questions?topicId=" + encodeURIComponent(t.id)}
                                >
                                  View Questions
                                </Link>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p className="curriculum-footnote">
                    Chapters organize learning. Official exam objectives remain separate in exam
                    taxonomy. Shared topics may appear in more than one chapter; domain counts count
                    each topic once.
                  </p>
                </>
              ) : (
                <div className="curriculum-empty">
                  <Layers3 size={28} aria-hidden="true" />
                  <h3>Select a chapter</h3>
                  <p>Explore topics and start practice without leaving the six-domain overview.</p>
                </div>
              )}
            </article>
          </div>
        </section>
      ) : (
        <p className="curriculum-hint">Select a domain to explore its sections and chapters.</p>
      )}
    </>
  );
}

function MappingReview() {
  const auth = useAuth(),
    identity = progressIdentity(auth);
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: sessionQueryKey(["/api/admin/curriculum/mapping"], identity),
    queryFn: ({ signal }) =>
      adminContentRequest<CurriculumMappingReport>("/api/admin/curriculum/mapping", { signal }),
    enabled: Boolean(identity) && open,
    retry: false,
    gcTime: 0,
  });
  return (
    <details className="curriculum-review" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Unmapped Topics / Admin review</summary>
      {open &&
        (query.isPending ? (
          <p role="status">Loading mapping report…</p>
        ) : query.isError ? (
          <p role="alert">
            Mapping report unavailable. <button onClick={() => void query.refetch()}>Retry</button>
          </p>
        ) : query.data ? (
          <>
            <p>
              {query.data.mapped.length} mapped · {query.data.unmapped.length} unmapped ·{" "}
              {query.data.ambiguous.length} ambiguous. No records are modified here.
            </p>
            {[...query.data.unmapped, ...query.data.ambiguous].map((t) => (
              <div key={t.id} className="curriculum-review-row">
                <strong>{t.name}</strong>
                <code>
                  {t.id} / {t.slug}
                </code>
                <p>
                  {t.status} · {t.reason}
                </p>
                <Link href="/admin/topics">Review in topic management</Link>
              </div>
            ))}
          </>
        ) : null)}
    </details>
  );
}
export function CurriculumExplorer() {
  const auth = useAuth(),
    identity = progressIdentity(auth);
  const query = useQuery({
    queryKey: sessionQueryKey(["/api/curriculum"], identity),
    queryFn: ({ signal }) => getCurriculum(signal),
    enabled: Boolean(identity),
    retry: false,
    gcTime: 0,
  });
  const account = useGetCurrentUser({
    query: {
      queryKey: sessionQueryKey(getGetCurrentUserQueryKey(), identity),
      enabled: Boolean(identity),
      retry: false,
      gcTime: 0,
    },
  });
  const [wantProgress, setWantProgress] = useState(false);
  const options = learningProgressOptions(identity ?? { userId: "", sessionId: "" });
  const progress = useGetLearningProgress({
    ...options,
    query: {
      ...options.query,
      enabled: Boolean(identity) && wantProgress,
      retry: false,
      gcTime: 0,
    },
  });
  const admin =
    account.data?.user.role === "ADMIN" &&
    account.data?.user.status === "ACTIVE" &&
    !account.isError;
  // Only request learner metrics when a chapter is selected, not on each expansion.
  return (
    <div className="page-wrap curriculum-page">
      <header className="curriculum-header">
        <div>
          <span className="curriculum-kicker">LEARN / CCNA 200-301</span>
          <h1>Curriculum Explorer</h1>
          <p>Six domains. A clear path through networking.</p>
          {query.data?.counts && identity && !query.isError ? <p>{query.data.counts.mappedQuestions} mapped published questions · {query.data.counts.availableQuestions} available across active topics</p> : null}
        </div>
        <span className="curriculum-edition">Learning navigation · v1</span>
      </header>
      {!auth.isLoaded ? (
        <p role="status">Checking your identity…</p>
      ) : !identity ? (
        <div className="curriculum-empty">
          <h2>Sign in to explore your curriculum</h2>
          <Link className="button-primary" href="/sign-in">
            Sign in
          </Link>
        </div>
      ) : query.isPending ? (
        <div role="status" className="curriculum-empty">
          Loading curriculum…
        </div>
      ) : query.isError ? (
        <div role="alert" className="curriculum-empty">
          <h2>Curriculum could not be loaded</h2>
          <p>Check your session and connection, then retry.</p>
          <button className="button-quiet" onClick={() => void query.refetch()}>
            Retry curriculum
          </button>
        </div>
      ) : query.data ? (
        <CurriculumView
          key={"curriculum:" + identity.userId + ":" + identity.sessionId}
          data={query.data}
          progress={progress.isError ? undefined : progress.data?.topics}
          admin={admin}
          onSelectChapter={() => setWantProgress(true)}
        />
      ) : null}
      {identity && admin ? (
        <MappingReview key={"review:" + identity.userId + ":" + identity.sessionId} />
      ) : null}
    </div>
  );
}
