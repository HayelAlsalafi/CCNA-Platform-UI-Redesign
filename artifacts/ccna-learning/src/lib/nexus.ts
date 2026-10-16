import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { nexusRequest, type NexusAnalytics, type NexusTopic } from "@workspace/api-client-react";
import { progressIdentity, sessionQueryKey } from "./learning-progress-cache";
export const accuracy = (correct: number, attempts: number) =>
  attempts ? Math.round((correct / attempts) * 100) : null;
export function recommendTopic(topics: NexusTopic[]) {
  return (
    [...topics]
      .filter((t) => t.available > 0)
      .sort((a, b) => {
        const aw = a.attempts >= 5 && a.correct / a.attempts < 0.7,
          bw = b.attempts >= 5 && b.correct / b.attempts < 0.7;
        if (aw !== bw) return aw ? -1 : 1;
        if (aw && bw) return a.correct / a.attempts - b.correct / b.attempts;
        return (
          b.available - b.attempted - (a.available - a.attempted) || a.name.localeCompare(b.name)
        );
      })[0] ?? null
  );
}
export function useNexusIdentity() {
  return progressIdentity(useAuth());
}
export function useNexusAnalytics(range = "30") {
  const identity = useNexusIdentity();
  return useQuery({
    queryKey: sessionQueryKey(["/api/nexus/analytics", range], identity),
    enabled: !!identity,
    gcTime: 0,
    retry: false,
    placeholderData: () => undefined,
    queryFn: ({ signal }) => nexusRequest<NexusAnalytics>("analytics?range=" + range, { signal }),
  });
}
export function useNexusLifetime() {
  const identity = useNexusIdentity(),
    actor = useRef(identity),
    generation = useRef(0),
    mounted = useRef(false);
  actor.current = identity;
  useEffect(() => {
    mounted.current = true;
    generation.current++;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  return {
    identity,
    capture: () => {
      const id = identity,
        run = generation.current;
      return () =>
        mounted.current &&
        run === generation.current &&
        !!id &&
        actor.current?.userId === id.userId &&
        actor.current?.sessionId === id.sessionId;
    },
  };
}
export function nexusError(error: unknown) {
  const e = error as { data?: { error?: { message?: string } } };
  return (
    e?.data?.error?.message ||
    "Request failed. Your recorded answers are retained; refresh before retrying."
  );
}
