import { useQuery } from "@tanstack/react-query";
import { customFetch, type PracticeHistoryDetailsResponse } from "@workspace/api-client-react";
import { sessionQueryKey } from "../lib/learning-progress-cache";
import { useAuth, useUser } from "@clerk/react";
import { Link } from "wouter";
import { ArrowRight, Target, Activity, Layers3, CheckCircle2 } from "lucide-react";
import {
  useNexusAnalytics,
  accuracy,
  recommendTopic,
  useNexusIdentity,
  nexusError,
} from "../lib/nexus";
import { NetworkHero, NetworkTopologyMap, LearningMetricCard } from "../components/nexus-visuals";
import {YearlyActivity,SkillMatrix,useLearnerProgress} from '../components/learning-evidence';
import { Skeleton } from "../components/ui/skeleton";
export function NexusOverview() {
  const progress=useLearnerProgress();
  const identity = useNexusIdentity(),
    auth = useAuth(),
    { user } = useUser(),
    query = useNexusAnalytics(),
    data = query.data,
    next = data ? recommendTopic(data.topics) : null,
    name = identity && user?.id === identity.userId ? user.firstName || "learner" : "learner";
  const recent = useQuery({
    queryKey: sessionQueryKey(["/api/nexus/recent-answers"], identity),
    enabled: !!identity && !!data && !data.sessions.items.length,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      customFetch<PracticeHistoryDetailsResponse>(
        "/api/practice/history?limit=5&includeDetails=true",
        { signal, credentials: "same-origin", cache: "no-store" },
      ),
  });
  return (
    <div className="nexus-page">
      <NetworkHero
        eyebrow="NETWORK COMMAND CENTER"
        title={identity ? `Welcome back, ${name}.` : "Connect your next network skill."}
        description="Build a clearer understanding of networks, one deliberate challenge at a time."
      >
        <Link href="/practice" className="nexus-button">
          Start Practice <ArrowRight size={16} />
        </Link>
        {data?.resume && (
          <Link href={"/practice?resume=" + data.resume.id} className="nexus-button secondary">
            Continue Learning
          </Link>
        )}
      </NetworkHero>
      {!auth.isLoaded ? (
        <Skeleton className="h-32" />
      ) : !identity ? (
        <div className="nexus-panel">
          <h2>Your learning network starts with you</h2>
          <p>Sign in to see your own progress, domain coverage and recorded practice.</p>
          <Link href="/sign-in" className="nexus-button">
            Sign in
          </Link>
        </div>
      ) : query.isPending ? (
        <div aria-label="Loading learning metrics" role="status">
          <Skeleton className="h-28 mb-5" />
          <Skeleton className="h-80" />
        </div>
      ) : query.isError ? (
        <div className="nexus-panel" role="alert">
          <h2>Learning data could not load</h2>
          <p>{nexusError(query.error)}</p>
          <button className="nexus-button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        data && (
          <>
            <div className="nexus-metrics">
              <LearningMetricCard
                label="Answers submitted"
                value={data.totals.attempts}
                detail="Persisted learner submissions"
                icon={<CheckCircle2 size={18} />}
              />
              <LearningMetricCard
                label="Overall accuracy"
                value={
                  accuracy(data.totals.correct, data.totals.attempts) === null
                    ? "—"
                    : accuracy(data.totals.correct, data.totals.attempts) + "%"
                }
                detail={`${data.totals.correct} correct of ${data.totals.attempts}`}
                icon={<Target size={18} />}
              />
              <LearningMetricCard
                label="Unique questions"
                value={data.totals.unique}
                detail={`${data.totals.available} questions currently available`}
                icon={<Layers3 size={18} />}
              />
              <LearningMetricCard
                label="Recent activity"
                value={
                  data.totals.lastActivity
                    ? new Date(data.totals.lastActivity).toLocaleDateString()
                    : "Not yet"
                }
                detail="Last recorded answer"
                icon={<Activity size={18} />}
              />
            </div>
            <NetworkTopologyMap domains={data.domains} />
            <YearlyActivity/>
            {progress.data?<SkillMatrix data={progress.data}/>:progress.isError?<section className="nexus-panel" role="alert"><p>{nexusError(progress.error)}</p><button onClick={()=>void progress.refetch()} className="nexus-button secondary">Retry skill evidence</button></section>:<Skeleton className="h-64"/>}
            <div className="nexus-overview-bottom">
              <section className="nexus-panel">
                <div className="nexus-section-heading">
                  <div>
                    <span className="nexus-eyebrow">LEARNING JOURNEY</span>
                    <h2>Your next connection</h2>
                  </div>
                </div>
                <ol className="nexus-learning-path">
                  <li>
                    <i />
                    <div>
                      <strong>Recorded learning</strong>
                      <p>
                        {data.totals.attempts} answers across {data.totals.unique} unique questions.{" "}
                        <Link href="/practice/history">Review your evidence</Link>
                      </p>
                    </div>
                  </li>
                  <li>
                    <i />
                    <div>
                      <strong>{next?.name ?? "Explore the curriculum"}</strong>
                      <p>
                        {next
                          ? `${next.available - next.attempted} available questions not yet attempted.`
                          : "No eligible recommendation is currently available."}
                      </p>
                    </div>
                  </li>
                  <li>
                    <i />
                    <div>
                      <strong>Suggested next activity</strong>
                      <p>
                        Prioritize a topic below 70% accuracy after at least five answers; otherwise
                        expand unattempted coverage. This is a transparent rule, not AI scoring.
                      </p>
                      {next && (
                        <Link href={"/practice?topicId=" + next.id} className="nexus-text-link">
                          Practice this topic <ArrowRight size={15} />
                        </Link>
                      )}
                    </div>
                  </li>
                </ol>
              </section>
              <section className="nexus-panel">
                <div className="nexus-section-heading">
                  <div>
                    <span className="nexus-eyebrow">RECENT LEARNING</span>
                    <h2>{data.persistence ? "Practice sessions" : "Recorded answer activity"}</h2>
                  </div>
                  <Link href="/practice/history">View all</Link>
                </div>
                {data.sessions.items.length ? (
                  <ul className="nexus-recent-list">
                    {data.sessions.items.map((s) => (
                      <li key={s.id}>
                        <div>
                          <strong>{s.topics || "CCNA practice"}</strong>
                          <small>
                            {new Date(s.createdAt).toLocaleDateString()} ·{" "}
                            {s.mode.replaceAll("_", " ")} · {s.answered}/{s.questionCount} answered
                          </small>
                        </div>
                        <Link href={"/practice/history?review=" + s.id}>Review →</Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div>
                    <p>
                      {data.persistence
                        ? "No tracked sessions yet. Recent individual submissions:"
                        : "Recent individual submissions. Persistent sessions require the separately approved additive upgrade."}
                    </p>
                    {recent.isPending ? (
                      <p role="status">Loading recent answers?</p>
                    ) : recent.isError ? (
                      <p>Recent answers could not load. Open Learning Intelligence to retry.</p>
                    ) : recent.data?.items.length ? (
                      <ul className="nexus-recent-list">
                        {recent.data.items.map((a) => (
                          <li key={a.id}>
                            <div>
                              <strong>{a.topicName || "Individual answer"}</strong>
                              <small>
                                {new Date(a.submittedAt).toLocaleString()} ?{" "}
                                {a.questionCode || "Legacy record"} ?{" "}
                                {a.isCorrect ? "Correct" : "Incorrect"}
                              </small>
                            </div>
                            <Link href="/practice/history">Review</Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No submitted answers yet.</p>
                    )}
                  </div>
                )}
                <p className="nexus-muted">
                  {data.totals.unmapped} available questions lack active v1.1 taxonomy mappings.
                  They are not assigned to a domain automatically.
                </p>
              </section>
            </div>
          </>
        )
      )}
    </div>
  );
}
