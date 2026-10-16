import { useEffect, useState, type FormEvent } from "react";
import {
  AdminPanel,
  AdminNotice,
  AdminToast,
  AdminSearch,
  AdminEmptyState,
  AdminLoading,
  AdminButton,
  StatusIndicator,
} from "./admin-ui";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminContentRequest,
  useAdminListQuestions,
  type Assignment,
  type Blueprint,
  type Domain,
  type Objective,
  type TaxonomyCatalog,
} from "@workspace/api-client-react";
import { useAdminSession } from "./admin-session-boundary";
import {
  adminQueryKey,
  adminMutationOptions,
  adminQueryOptions,
  invalidateAdminQueries,
} from "../lib/admin-session";
export function contentError(error: unknown): string {
  const e = error as {
    data?: { error?: { message?: string; details?: { path: string; message: string }[] } };
  };
  return [
    e?.data?.error?.message ?? "Request failed. Refresh or sign in again.",
    ...(e?.data?.error?.details ?? []).map((d) => `${d.path}: ${d.message}`),
  ].join(" ");
}
export const inputStyle = {
  padding: 8,
  border: "1px solid var(--line)",
  borderRadius: 6,
  width: "100%",
  background: "var(--surface, #fff)",
  font: "inherit",
};
export const panelStyle = {
  padding: 20,
  border: "1px solid var(--line)",
  borderRadius: 10,
  marginBottom: 20,
  background: "var(--surface, #fff)",
};
export function useTaxonomyCatalog() {
  const session = useAdminSession();
  return useQuery({
    queryKey: adminQueryKey(["/api/admin/taxonomy"], session.identity),
    queryFn: ({ signal }) =>
      adminContentRequest<TaxonomyCatalog>("/api/admin/taxonomy", { signal }),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
type Kind = "blueprints" | "domains" | "objectives";
function blank(kind: Kind): Record<string, string> {
  return kind === "blueprints"
    ? {
        examCode: "200-301",
        version: "1.1",
        title: "CCNA",
        status: "DRAFT",
        sourceUrl: "",
        verifiedAt: "",
      }
    : kind === "domains"
      ? { blueprintId: "", code: "", name: "", weightPercent: "", displayOrder: "0" }
      : { domainId: "", code: "", description: "", displayOrder: "0" };
}
const labels: Record<string, string> = {
  examCode: "Exam code",
  version: "Version",
  title: "Title",
  status: "Status",
  sourceUrl: "Official documentation URL",
  verifiedAt: "Verified at (ISO timestamp, after source review)",
  blueprintId: "Blueprint",
  domainId: "Domain",
  code: "Objective / domain code",
  name: "Domain name",
  weightPercent: "Weight (%)",
  displayOrder: "Display order",
  description: "Objective description",
};
export function AdminTaxonomyManager() {
  const session = useAdminSession(),
    client = useQueryClient(),
    catalog = useTaxonomyCatalog();
  const [kind, setKind] = useState<Kind>("blueprints"),
    [editing, setEditing] = useState<string | null>(null),
    [form, setForm] = useState<Record<string, string>>(blank("blueprints"));
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false),
    [search, setSearch] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [selectedBlueprint, setSelectedBlueprint] = useState("");
  const data = catalog.data ?? { blueprints: [], domains: [], objectives: [] };
  const mutationOptions = adminMutationOptions("saveTaxonomy", session.identity);
  const mutation = useMutation({
    ...mutationOptions.mutation,
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      adminContentRequest(path, {
        ...mutationOptions.request,
        method: editing ? "PUT" : "POST",
        headers: { ...mutationOptions.request.headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  });
  function reset(next: Kind) {
    setKind(next);
    setEditing(null);
    setForm(blank(next));
    setError("");
    setDialogOpen(true);
  }
  function edit(next: Kind, row: Blueprint | Domain | Objective) {
    reset(next);
    setEditing(row.id);
    setForm(
      Object.fromEntries(
        Object.keys(blank(next)).map((key) => [
          key,
          String((row as unknown as Record<string, unknown>)[key] ?? ""),
        ]),
      ),
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!session.isCurrent()) return;
    const current = session.capture();
    setError("");
    setNotice("");
    let body: Record<string, unknown> = { ...form };
    if (kind === "blueprints")
      body = { ...body, sourceUrl: form.sourceUrl || null, verifiedAt: form.verifiedAt || null };
    else {
      body.displayOrder = Number(form.displayOrder);
      if (kind === "domains") body.weightPercent = Number(form.weightPercent);
      else {
        const domain = data.domains.find((d) => d.id === form.domainId);
        if (!domain) {
          setError("Choose a domain.");
          return;
        }
        body.blueprintId = domain.blueprintId;
        body.domainCode = domain.code;
      }
    }
    try {
      await mutation.mutateAsync({
        path: `/api/admin/taxonomy/${kind}${editing ? `/${editing}` : ""}`,
        body,
      });
      if (!current()) return;
      await invalidateAdminQueries(client, ["/api/admin/taxonomy"], session.identity);
      reset(kind);
      setDialogOpen(false);
      setNotice("Taxonomy saved.");
    } catch (e) {
      if (current()) setError(contentError(e));
    }
  }
  if (catalog.isLoading) return <AdminLoading label="Loading taxonomy" />;
  if (catalog.isError)
    return (
      <AdminNotice tone="error">
        {contentError(catalog.error)}{" "}
        <AdminButton variant="outline" onClick={() => void catalog.refetch()}>
          Retry
        </AdminButton>
      </AdminNotice>
    );
  const term = search.trim().toLowerCase();
  const filtered = data.blueprints.filter(
    (b) =>
      (!statusFilter || b.status === statusFilter) &&
      (!term ||
        [
          b.examCode,
          b.version,
          b.title,
          ...data.domains.filter((d) => d.blueprintId === b.id).map((d) => d.name),
          ...data.objectives
            .filter((o) => o.blueprintId === b.id)
            .map((o) => o.code + " " + o.description),
        ]
          .join(" ")
          .toLowerCase()
          .includes(term)),
  );
  const selected = filtered.find((b) => b.id === selectedBlueprint) ?? filtered[0];
  const chosenDomains = data.domains.filter((d) => d.blueprintId === selected?.id);
  const weight = chosenDomains.reduce((n, d) => n + d.weightPercent, 0);
  return (
    <>
      {notice && <AdminToast message={notice} onDismiss={() => setNotice("")} />}
      <Tabs
        defaultValue={
          new URLSearchParams(window.location.search).has("question") ? "associations" : "catalog"
        }
        className="admin-tabs"
      >
        <TabsList className="admin-tabs-list" aria-label="Taxonomy workspace">
          <TabsTrigger value="catalog">Blueprints & objectives</TabsTrigger>
          <TabsTrigger value="associations">Question associations</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog">
          <div className="admin-toolbar">
            <AdminSearch
              label="Search taxonomy"
              value={search}
              onChange={setSearch}
              placeholder="Search versions, domains or objectives"
            />
            <label>
              <span className="sr-only">Blueprint status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                {["DRAFT", "ACTIVE", "RETIRED"].map((status) => (
                  <option key={status} value={status}>
                    {status[0] + status.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <AdminButton onClick={() => reset("blueprints")}>Create blueprint</AdminButton>
          </div>
          {!filtered.length ? (
            <AdminEmptyState
              title={data.blueprints.length ? "No matching blueprints" : "No blueprints yet"}
              description={
                data.blueprints.length
                  ? "Try a different search or status filter."
                  : "Start with a draft blueprint, then add its domains and reviewed objectives."
              }
              action={
                <AdminButton
                  variant="outline"
                  onClick={() =>
                    data.blueprints.length
                      ? (setSearch(""), setStatusFilter(""))
                      : reset("blueprints")
                  }
                >
                  {data.blueprints.length ? "Clear filters" : "Create blueprint"}
                </AdminButton>
              }
            />
          ) : (
            <div className="taxonomy-layout">
              <aside className="blueprint-list" aria-label="Exam blueprints">
                {filtered.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={selected?.id === b.id}
                    onClick={() => setSelectedBlueprint(b.id)}
                  >
                    <strong>
                      {b.examCode} / v{b.version}
                    </strong>
                    <span>{b.title}</span>
                    <StatusIndicator status={b.status} />
                  </button>
                ))}
              </aside>
              {selected && (
                <AdminPanel
                  title={selected.examCode + " / " + selected.title + " v" + selected.version}
                  action={
                    <AdminButton variant="outline" onClick={() => edit("blueprints", selected)}>
                      Edit blueprint
                    </AdminButton>
                  }
                >
                  <div className="taxonomy-meta">
                    <StatusIndicator status={selected.status} />
                    <span>
                      {chosenDomains.length} domains /{" "}
                      {data.objectives.filter((o) => o.blueprintId === selected.id).length}{" "}
                      objectives
                    </span>
                    <span>Domain weights: {weight}% / 100%</span>
                  </div>
                  {weight !== 100 && (
                    <p className="admin-form-help">
                      A draft can be incomplete. Activation requires complete domain weights
                      totaling 100% and all six CCNA domain codes.
                    </p>
                  )}
                  <details>
                    <summary>Source and blueprint identity</summary>
                    <p>
                      Blueprint ID: <code>{selected.id}</code>
                    </p>
                    <p>
                      {selected.sourceUrl ? (
                        <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                          Open source documentation
                        </a>
                      ) : (
                        "Source not recorded."
                      )}
                    </p>
                    <p>
                      Verified:{" "}
                      {selected.verifiedAt
                        ? new Date(selected.verifiedAt).toLocaleString()
                        : "Pending review"}
                    </p>
                  </details>
                  <div className="admin-summary-actions">
                    <AdminButton
                      variant="outline"
                      onClick={() => {
                        reset("domains");
                        setForm({ ...blank("domains"), blueprintId: selected.id });
                      }}
                    >
                      Create domain
                    </AdminButton>
                    <AdminButton
                      variant="outline"
                      disabled={!chosenDomains.length}
                      onClick={() => {
                        reset("objectives");
                        setForm({ ...blank("objectives"), domainId: chosenDomains[0]?.id ?? "" });
                      }}
                    >
                      Create objective
                    </AdminButton>
                  </div>
                  {!chosenDomains.length && (
                    <AdminEmptyState
                      title="Define the domain structure"
                      description="Add the official domains and weights for this blueprint. No questions will be classified automatically."
                    />
                  )}
                  {chosenDomains.map((d) => (
                    <section className="domain-section" key={d.id}>
                      <div className="domain-heading">
                        <div>
                          <h3>
                            {d.code} {d.name}
                          </h3>
                          <p className="admin-muted">{d.weightPercent}% exam weight</p>
                        </div>
                        <AdminButton variant="outline" onClick={() => edit("domains", d)}>
                          Edit domain
                        </AdminButton>
                      </div>
                      {data.objectives
                        .filter(
                          (o) =>
                            o.domainId === d.id &&
                            (!term ||
                              (o.code + " " + o.description).toLowerCase().includes(term) ||
                              [selected.examCode, selected.title, selected.version, d.name]
                                .join(" ")
                                .toLowerCase()
                                .includes(term)),
                        )
                        .map((o) => (
                          <div key={o.id} className="objective-row">
                            <strong>{o.code}</strong>
                            <p>{o.description}</p>
                            <AdminButton
                              variant="ghost"
                              aria-label={"Edit objective " + o.code}
                              onClick={() => edit("objectives", o)}
                            >
                              Edit
                            </AdminButton>
                          </div>
                        ))}
                      {!data.objectives.some((o) => o.domainId === d.id) && (
                        <p className="admin-muted">No objectives in this domain yet.</p>
                      )}
                    </section>
                  ))}
                </AdminPanel>
              )}
            </div>
          )}
        </TabsContent>
        <TabsContent value="associations">
          <QuestionObjectiveEditor catalog={data} />
        </TabsContent>
      </Tabs>
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!mutation.isPending) setDialogOpen(open);
        }}
      >
        <DialogContent
          className="admin-dialog"
          onEscapeKeyDown={(e) => {
            if (mutation.isPending) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (mutation.isPending) e.preventDefault();
          }}
        >
          <DialogTitle>
            {editing ? "Edit" : "Create"} {kind.slice(0, -1)}
          </DialogTitle>
          <DialogDescription>
            {kind === "blueprints"
              ? "Create drafts first. Source verification and complete domains are required before activation."
              : kind === "domains"
                ? "Domain codes and weights must match the reviewed exam blueprint."
                : "Choose a domain and use its official objective code. Existing referenced bindings remain protected."}
          </DialogDescription>
          <form onSubmit={save}>
            <fieldset disabled={mutation.isPending} className="admin-form-grid">
              {Object.entries(form).map(([key, value]) => (
                <label key={key}>
                  {labels[key]}
                  {key === "status" ? (
                    <select
                      style={inputStyle}
                      value={value}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    >
                      {["DRAFT", "ACTIVE", "RETIRED"].map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  ) : key === "blueprintId" || key === "domainId" ? (
                    <select
                      required
                      style={inputStyle}
                      value={value}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    >
                      <option value="">Choose a record</option>
                      {key === "blueprintId"
                        ? data.blueprints.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.examCode} v{b.version} - {b.title}
                            </option>
                          ))
                        : data.domains.map((d) => (
                            <option key={d.id} value={d.id}>
                              {data.blueprints.find((b) => b.id === d.blueprintId)?.version} /{" "}
                              {d.code} - {d.name}
                            </option>
                          ))}
                    </select>
                  ) : key === "description" ? (
                    <textarea
                      required
                      style={inputStyle}
                      rows={4}
                      value={value}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    />
                  ) : (
                    <input
                      style={inputStyle}
                      required={!["sourceUrl", "verifiedAt"].includes(key)}
                      type={
                        ["weightPercent", "displayOrder"].includes(key)
                          ? "number"
                          : key === "sourceUrl"
                            ? "url"
                            : "text"
                      }
                      min={key === "weightPercent" ? 1 : 0}
                      max={key === "weightPercent" ? 100 : undefined}
                      step={1}
                      value={value}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    />
                  )}
                </label>
              ))}
            </fieldset>
            {kind === "blueprints" && (
              <>
                <p className="admin-form-help">
                  Use an HTTP/HTTPS link to the official source. Record an ISO timestamp only after
                  reviewing that version's content; activation requires it and complete domain
                  weights.
                </p>
                <AdminButton
                  variant="outline"
                  type="button"
                  onClick={() => setForm({ ...form, verifiedAt: new Date().toISOString() })}
                >
                  Record verification now
                </AdminButton>
                {form.status === "ACTIVE" && (
                  <label className="import-confirmation">
                    <input type="checkbox" required />I reviewed this blueprint's source and confirm
                    its activation requirements.
                  </label>
                )}
              </>
            )}
            {error && <AdminNotice tone="error">{error}</AdminNotice>}
            <div className="admin-form-actions">
              <AdminButton
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </AdminButton>
              <AdminButton type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : "Save taxonomy"}
              </AdminButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuestionObjectiveEditor({ catalog }: { catalog: TaxonomyCatalog }) {
  const session = useAdminSession(),
    client = useQueryClient();
  const [questionId, setQuestionId] = useState(
    () => new URLSearchParams(window.location.search).get("question") ?? "",
  );
  const [blueprintId, setBlueprintId] = useState(""),
    [assignments, setAssignments] = useState<Assignment[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const questions = useAdminListQuestions(
    { limit: 100, offset: 0 },
    adminQueryOptions(["/api/admin/questions", { limit: 100, offset: 0 }], session.identity),
  );
  const valid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(questionId);
  const selected = useQuery({
    queryKey: adminQueryKey(["/api/admin/taxonomy", questionId], session.identity),
    queryFn: ({ signal }) =>
      adminContentRequest<Assignment[]>(`/api/admin/taxonomy/questions/${questionId}/objectives`, {
        signal,
      }),
    enabled: valid,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    setAssignments(selected.data ?? []);
    setNotice("");
    setError("");
  }, [selected.data, questionId]);
  const opts = adminMutationOptions("questionObjectives", session.identity);
  const save = useMutation({
    ...opts.mutation,
    mutationFn: () =>
      adminContentRequest(`/api/admin/taxonomy/questions/${questionId}/objectives`, {
        ...opts.request,
        method: "PUT",
        headers: { ...opts.request.headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: assignments.map(({ objectiveId, blueprintId, isPrimary }) => ({
            objectiveId,
            blueprintId,
            isPrimary,
          })),
        }),
      }),
  });
  const visible = catalog.objectives.filter((o) => o.blueprintId === blueprintId);
  return (
    <section className="admin-panel">
      <div className="admin-panel-body">
        <h2>Question objectives</h2>
        <p>
          Select objectives explicitly. Each blueprint may have one primary objective. Saving an
          empty selection removes classifications only.
        </p>
        <label>
          Question ID
          <input
            style={inputStyle}
            list="taxonomy-questions"
            value={questionId}
            onChange={(e) => setQuestionId(e.target.value)}
          />
        </label>
        <datalist id="taxonomy-questions">
          {questions.data?.items.map((q) => (
            <option key={q.id} value={q.id}>
              {q.questionCode} — {q.text.slice(0, 90)}
            </option>
          ))}
        </datalist>
        <label>
          Blueprint
          <select
            style={inputStyle}
            value={blueprintId}
            onChange={(e) => setBlueprintId(e.target.value)}
          >
            <option value="">Choose a blueprint…</option>
            {catalog.blueprints.map((b) => (
              <option key={b.id} value={b.id}>
                {b.examCode} {b.version}
              </option>
            ))}
          </select>
        </label>
        {selected.isError && <p role="alert">{contentError(selected.error)}</p>}
        {visible.map((o) => {
          const mapped = assignments.find((a) => a.objectiveId === o.id);
          return (
            <div key={o.id} className="association-row">
              <label>
                <input
                  type="checkbox"
                  checked={!!mapped}
                  onChange={(e) =>
                    setAssignments(
                      e.target.checked
                        ? [
                            ...assignments,
                            { objectiveId: o.id, blueprintId: o.blueprintId, isPrimary: false },
                          ]
                        : assignments.filter((a) => a.objectiveId !== o.id),
                    )
                  }
                />{" "}
                {o.code} — {o.description}
              </label>{" "}
              <label>
                <input
                  type="radio"
                  aria-label={`Make objective ${o.code} primary for this blueprint`}
                  name={`primary-${o.blueprintId}`}
                  disabled={!mapped}
                  checked={mapped?.isPrimary ?? false}
                  onChange={() =>
                    setAssignments(
                      assignments.map((a) =>
                        a.blueprintId === o.blueprintId
                          ? { ...a, isPrimary: a.objectiveId === o.id }
                          : a,
                      ),
                    )
                  }
                />{" "}
                Primary
              </label>
            </div>
          );
        })}
        <button
          className="button-quiet"
          onClick={() =>
            setAssignments(
              assignments.map((a) =>
                a.blueprintId === blueprintId ? { ...a, isPrimary: false } : a,
              ),
            )
          }
        >
          Clear primary for this blueprint
        </button>
        <p>{assignments.length} objective association(s) across all blueprints.</p>
        <button
          className="button-primary"
          disabled={!valid || selected.isLoading || selected.isError || save.isPending}
          onClick={async () => {
            if (!session.isCurrent()) return;
            const current = session.capture();
            try {
              await save.mutateAsync();
              if (!current()) return;
              await invalidateAdminQueries(client, ["/api/admin/taxonomy"], session.identity);
              setNotice("Objective associations saved.");
              setError("");
            } catch (e) {
              if (current()) setError(contentError(e));
            }
          }}
        >
          Save objective associations
        </button>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </div>
    </section>
  );
}
