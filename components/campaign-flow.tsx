"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OriginalPhoto } from "@/components/original-photo";
import CampaignWorkspace from "./campaign-workspace";
import LandscapeDiscovery from "./landscape-discovery";
import {
  activeStatus,
  generationSizeLabel,
  type Asset,
  type Batch,
  type ModelPack,
  type Project,
} from "@/lib/domain";
import {
  lifestyleSetups,
  sceneSetup,
  setupMode,
  setupProblem,
  applyExistingSetup,
  startCustomSetup,
  customizeSetup,
  flowSchema,
  flowSections,
  aspectOptions,
  shootPackages,
  plannedShot,
  matchingShot,
  type CampaignFlowState,
  type FlowDocument,
  type PlannedShot,
} from "@/lib/campaign-flow";
import { photoshootShots } from "@/lib/photoshoot";
import "./campaign-flow.css";
async function call<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const r = await fetch(
    "/api/studio/" + path,
    body === undefined
      ? undefined
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok)
    throw Object.assign(
      new Error(data.error || "Unable to save. Please try again."),
      { status: r.status },
    );
  return data;
}
type PendingGeneration = { id: string; revision: number; shot_ids: string[] };
function readPending(key: string): PendingGeneration | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return typeof value.id === "string" &&
      Number.isInteger(value.revision) &&
      Array.isArray(value.shot_ids)
      ? value
      : null;
  } catch {
    return null;
  }
}
type Props = {
  project: Project;
  projects: Project[];
  assets: Asset[];
  batches: Batch[];
  modelPacks: ModelPack[];
  onNav: (v: string) => void;
  onRefresh: () => Promise<unknown>;
  onBatch: (b: Batch) => void;
  onTools: () => void;
};
export default function CampaignFlow(props: Props) {
  const [doc, setDoc] = useState<FlowDocument | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    call<FlowDocument>("projects/" + props.project.id + "/workflow")
      .then((d) => {
        if (live) setDoc(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [props.project.id]);
  if (!doc)
    return (
      <main className="flow-loading">
        <p role="status">{error || "Opening campaign…"}</p>
        <Button onClick={() => props.onNav("campaigns")}>Campaigns</Button>
      </main>
    );
  return <FlowEditor {...props} initial={doc} />;
}
function FlowEditor({ initial, ...p }: Props & { initial: FlowDocument }) {
  const pendingKey = "campaign-generation:" + p.project.id;
  const [pending, setPending] = useState<PendingGeneration | null>(() =>
    readPending(pendingKey),
  );
  const [state, setState] = useState(initial.state),
    [saved, setSaved] = useState(
      initial.persisted ? JSON.stringify(initial.state) : "",
    ),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [sceneSource, setSceneSource] = useState("library"),
    [choosingSetup, setChoosingSetup] = useState(false),
    [discovery, setDiscovery] = useState(false),
    [review, setReview] = useState<Asset | null>(null),
    [advanced, setAdvanced] = useState(false),
    [catalog, setCatalog] = useState(""),
    [renaming, setRenaming] = useState(p.project.name === "Untitled campaign"),
    [name, setName] = useState(p.project.name);
  const revision = useRef(initial.revision),
    queue = useRef(Promise.resolve(initial)),
    lastSaved = useRef(initial.persisted ? JSON.stringify(initial.state) : ""),
    failed = useRef(false);
  const dirty = JSON.stringify(state) !== saved;
  const endpoint = "projects/" + p.project.id + "/workflow";
  function patch(update: Partial<CampaignFlowState>) {
    failed.current = false;
    if (update.section && update.section !== state.section) setQuery("");
    setState((s) => ({ ...s, ...update }));
  }
  const mode = setupMode(state);
  function replaceSetup(next: CampaignFlowState) {
    patch(next);
    setSelected([]);
    setQuery("");
    setDiscovery(false);
    setChoosingSetup(false);
    setCatalog("");
  }
  function chooseScene(id: string) {
    if (id !== state.scene_id) replaceSetup(startCustomSetup(state, id));
  }
  async function reuseCampaign(id: string) {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      const prior = await call<FlowDocument>("projects/" + id + "/workflow");
      if (!prior.state.scene_id)
        throw new Error(
          "That campaign has no saved setting. Choose another setup.",
        );
      const problem = setupProblem(prior.state);
      if (problem) throw new Error(problem);
      const campaign = p.projects.find((c) => c.id === id)!;
      replaceSetup(
        applyExistingSetup(
          state,
          campaign.name,
          `${id} · revision ${prior.revision}`,
          sceneSetup(prior.state),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function save(value: CampaignFlowState): Promise<FlowDocument> {
    const text = JSON.stringify(value);
    const next = queue.current
      .catch(() => initial)
      .then(async () => {
        if (lastSaved.current === text)
          return { revision: revision.current, state: value };
        setSaving(true);
        try {
          const d = await call<FlowDocument>(
            endpoint,
            { revision: revision.current, state: value },
            "PUT",
          );
          revision.current = d.revision;
          lastSaved.current = text;
          setSaved(text);
          setError("");
          return d;
        } catch (e) {
          failed.current = true;
          setError((e as Error).message);
          throw e;
        } finally {
          setSaving(false);
        }
      });
    queue.current = next;
    return next;
  }
  useEffect(() => {
    if (!dirty || failed.current) return;
    const timer = setTimeout(() => {
      void save(state).catch(() => {});
    }, 700);
    return () => clearTimeout(timer);
    // The queue serializes requests; each timer captures the edited document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  useEffect(() => {
    const flush = () => {
      if (dirty) void save(state).catch(() => {});
    };
    window.addEventListener("studio:before-navigation", flush);
    return () => window.removeEventListener("studio:before-navigation", flush);
    // Flush the current edit when browser history leaves this workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, dirty]);
  const jobs = p.batches.flatMap((b) =>
    b.jobs.map((j) => ({
      batch: b,
      job: j,
      asset: p.assets.find((a) => a.id === j.result_asset_id),
    })),
  );
  const completed = state.shots.filter((s) =>
    jobs.some(
      ({ batch, job }) =>
        job.shot_id === s.id &&
        job.status === "ready" &&
        matchingShot(batch, s, state),
    ),
  );
  const running = jobs.some(({ job }) => activeStatus(job.status));
  const rv = p.assets.find((a) => a.id === state.rv_id),
    scene = p.assets.find((a) => a.id === state.scene_id);
  const allRvs = p.assets.filter((a) => a.kind === "rv");
  const referenceOnlyIds = new Set(
    p.modelPacks.flatMap((pack) =>
      pack.assets
        .filter((a) => ["evaluation", "style", "interior"].includes(a.role))
        .map((a) => a.asset_id),
    ),
  );
  const available = allRvs.filter(
    (a) => !referenceOnlyIds.has(a.id) || a.id === state.rv_id,
  );
  const named = (a: Asset) =>
    [a.name, a.brand, a.model, a.year]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase());
  async function leave(action: () => void) {
    if (busy) return;
    try {
      await save(state);
      await p.onRefresh();
      action();
    } catch {}
  }
  function shotUpdate(id: string, update: Partial<PlannedShot>) {
    patch({
      shots: state.shots.map((s) => (s.id === id ? { ...s, ...update } : s)),
    });
  }
  async function upload(
    file: File | undefined,
    kind: "rv" | "landscape" | "prop",
    supporting = false,
  ) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const f = new FormData();
      f.set("file", file);
      f.set("kind", kind);
      f.set("name", file.name.replace(/\.[^.]+$/, ""));
      const r = await fetch("/api/studio/assets", { method: "POST", body: f });
      const a = (await r.json()) as Asset & { error?: string };
      if (!r.ok) throw new Error(a.error || "Upload failed");
      await p.onRefresh();
      patch(
        kind === "rv"
          ? supporting ? { identity_ids: [a.id] } : { rv_id: a.id, identity_ids: [] }
          : kind === "landscape"
            ? startCustomSetup(state, a.id)
            : { prop_ids: [a.id] },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    setBusy(true);
    setError("");
    try {
      let request = pending;
      if (!request) {
        const document = await save(state);
        request = {
          id: crypto.randomUUID(),
          revision: document.revision,
          shot_ids: selected,
        };
        sessionStorage.setItem(pendingKey, JSON.stringify(request));
        setPending(request);
      }
      const b = await call<Batch>(endpoint + "/generate", request);
      sessionStorage.removeItem(pendingKey);
      setPending(null);
      p.onBatch(b);
      setSelected([]);
      patch({ section: "results" });
      await p.onRefresh();
    } catch (e) {
      const failure = e as Error & { status?: number };
      if (
        [400, 422, 429].includes(failure.status ?? 0) ||
        failure.message ===
          "Save the latest campaign settings before generating."
      ) {
        sessionStorage.removeItem(pendingKey);
        setPending(null);
      }
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const title = {
    rv: "Choose the RV.",
    scene: "Choose your shoot setup.",
    plan: "Direct the whole shoot.",
    results: "Review your campaign.",
  }[state.section];
  return (
    <div className="flow-app">
      <header className="flow-top">
        <button
          className="flow-brand"
          onClick={() => void leave(() => p.onNav("campaigns"))}
        >
          THOR STUDIO
        </button>
        <nav aria-label="Studio navigation">
          <Button
            variant="ghost"
            onClick={() => void leave(() => p.onNav("campaigns"))}
          >
            Campaigns
          </Button>
          <Button
            variant="ghost"
            onClick={() => void leave(() => p.onNav("inventory"))}
          >
            RV Inventory
          </Button>
          <Button
            variant="ghost"
            onClick={() => void leave(() => p.onNav("library"))}
          >
            Asset Library
          </Button>
        </nav>
      </header>
      <main className="flow-main">
        {pending && !busy && (
          <div className="flow-note">
            <p>
              The last generation response has not been confirmed. Recover it
              before requesting more photos.
            </p>
            <Button disabled={busy} onClick={() => void generate()}>
              Recover last request
            </Button>
          </div>
        )}
        <div className="flow-heading">
          <div>
            <p className="flow-eyebrow">CAMPAIGN WORKSPACE</p>
            {renaming ? (
              <form
                className="flow-toolbar"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await call(
                      "projects/" + p.project.id,
                      { name: name.trim() },
                      "PATCH",
                    );
                    await p.onRefresh();
                    setRenaming(false);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Input
                  aria-label="Campaign name"
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                />
                <Button disabled={!name.trim()} type="submit">
                  Name campaign
                </Button>
              </form>
            ) : (
              <h1>
                {p.project.name}{" "}
                <button
                  className="flow-rename"
                  aria-label="Rename campaign"
                  onClick={() => setRenaming(true)}
                >
                  Rename
                </button>
              </h1>
            )}
          </div>
          <div className="flow-save">
            <span role="status">
              {saving
                ? "Saving…"
                : dirty
                  ? "Unsaved changes"
                  : "All changes saved"}
            </span>
            <Button
              variant="outline"
              disabled={saving || !dirty}
              onClick={() => void save(state).catch(() => {})}
            >
              Save campaign
            </Button>
          </div>
        </div>
        <nav className="flow-steps" aria-label="Campaign workflow">
          {flowSections.map((section, i) => (
            <button
              key={section}
              aria-current={state.section === section ? "step" : undefined}
              onClick={() => patch({ section })}
            >
              <span>{i + 1}</span>
              {["RV", "Shoot setup", "Deliverables", "Results"][i]}
            </button>
          ))}
        </nav>
        <div className="flow-summary">
          <span>
            <b>RV</b> {rv?.name || "Choose a unit"}
          </span>
          <span>
            <b>Setting</b> {scene?.name || "Choose a scene"}
          </span>
          <span>
            <b>Plan</b> {state.shots.length} shots · {completed.length} ready
            for this brief
          </span>
        </div>
        {error && (
          <div className="flow-error" role="alert">
            {error}
          </div>
        )}
        <fieldset disabled={busy}>
          <div className="flow-section-heading">
            <div>
              <h2>{title}</h2>
              <p>
                {
                  {
                    rv: "Start with one real unit. Its photographs define the vehicle in every image.",
                    scene:
                      "Reuse a complete shoot setup, or create a custom setting and direction.",
                    plan: "Choose the deliverables you need. Each shot has its own framing, purpose and image shape. Camera angles adapt to the views your RV photos support.",
                    results:
                      "Every generated image is kept as a draft. Review identity, lifestyle and framing before approval.",
                  }[state.section]
                }
              </p>
            </div>
          </div>
          {state.section === "rv" && (
            <>
              <div className="flow-toolbar">
                <Input
                  aria-label="Search RV inventory"
                  placeholder="Search units…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <label className="flow-upload">
                  Upload RV photo
                  <input
                    aria-label="Upload RV photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy}
                    onChange={(e) => void upload(e.target.files?.[0], "rv")}
                  />
                </label>
              </div>
              <label className="flow-field">
                Reuse the RV from a campaign
                <select
                  aria-label="Reuse the RV from a campaign"
                  value=""
                  onChange={(e) => {
                    const previous = p.projects.find(
                      (x) => x.id === e.target.value,
                    );
                    if (previous?.rv_id)
                      patch({ rv_id: previous.rv_id, identity_ids: [] });
                  }}
                >
                  <option value="">Choose a previous campaign…</option>
                  {p.projects
                    .filter((x) => x.rv_id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </label>
              {!!p.modelPacks.length && (
                <details>
                  <summary>Reusable RV reference packs</summary>
                  <div className="flow-pack-list">
                    {p.modelPacks.map((pack) => {
                      const refs = pack.assets.filter(
                        (a) =>
                          a.approved_for_generation &&
                          ["base", "identity", "detail"].includes(a.role),
                      );
                      const base = refs.find((a) =>
                        allRvs.some((r) => r.id === a.asset_id),
                      );
                      return (
                        <Button
                          key={pack.id}
                          variant="outline"
                          disabled={!base}
                          onClick={() =>
                            patch({
                              rv_id: base!.asset_id,
                              identity_ids: refs
                                .filter((a) => a.asset_id !== base!.asset_id)
                                .slice(0, 1)
                                .map((a) => a.asset_id),
                            })
                          }
                        >
                          {pack.name} · Identity pack
                        </Button>
                      );
                    })}
                  </div>
                </details>
              )}
              <div className="flow-assets">
                {available.filter(named).map((a) => (
                  <AssetChoice
                    key={a.id}
                    asset={a}
                    selected={a.id === state.rv_id}
                    onClick={() => patch({ rv_id: a.id, identity_ids: [] })}
                  />
                ))}
              </div>
              {state.rv_id && (
                <div className="flow-setup-summary">
                  <strong>{state.identity_ids.length ? "RV views will be checked together" : "Single RV photo: preserve its photographed view"}</strong>
                  <p>Shot variety comes from framing, people, activity and image shape. New RV angles require a matching photo of this exact unit. Duplicate views and detail crops do not unlock unseen sides.</p>
                  <label className="flow-field">
                    Additional photo of this exact RV (optional)
                    <select aria-label="Additional RV view" disabled={busy}
                      value={state.identity_ids[0] || ""}
                      onChange={e => patch({identity_ids: e.target.value ? [e.target.value] : []})}>
                      <option value="">Use the primary photo only</option>
                      {p.assets.filter(a => a.id !== state.rv_id && a.id !== state.scene_id &&
                        ((a.kind === "rv" && !referenceOnlyIds.has(a.id)) || state.identity_ids.includes(a.id))).map(a =>
                        <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </label>
                  <label className="flow-upload">
                    Upload another view of this RV
                    <input aria-label="Upload additional RV view" type="file"
                      accept="image/jpeg,image/png,image/webp" disabled={busy}
                      onChange={e => void upload(e.target.files?.[0], "rv", true)} />
                  </label>
                  {!!state.identity_ids.length && <p>The planner checks whether the additional photo supports the same unit and angle. Uncertain or conflicting views are excluded from its shot directions.</p>}
                </div>
              )}
            </>
          )}
          {state.section === "scene" && (
            <>
              <div className="flow-setup-paths" aria-label="Setup approach">
                <Button
                  variant={
                    mode === "existing" || choosingSetup ? "default" : "outline"
                  }
                  onClick={() => {
                    setChoosingSetup(true);
                    setQuery("");
                  }}
                >
                  Use an existing setup
                </Button>
                <Button
                  variant={
                    mode === "custom" && !choosingSetup ? "default" : "outline"
                  }
                  onClick={() => {
                    if (mode === "custom") setChoosingSetup(false);
                    else replaceSetup(startCustomSetup(state));
                  }}
                >
                  {mode === "existing"
                    ? "Start a new custom setup"
                    : "Create a custom setup"}
                </Button>
              </div>
              {(mode === "unselected" || choosingSetup) && (
                <section
                  className="flow-setup-picker"
                  aria-label="Existing setups"
                >
                  <h3>Choose a complete shoot setup</h3>
                  <p>
                    Reuse its setting, light, people and props with your
                    selected RV. Choosing a setup replaces the previous scene
                    direction and resets shot instructions; existing photos stay
                    in Results.
                  </p>
                  <div className="flow-assets">
                    {lifestyleSetups.map((setup) => {
                      const source = p.assets.find(
                        (a) =>
                          a.kind === "landscape" &&
                          a.name.startsWith(setup.match),
                      );
                      return source ? (
                        <button
                          className="flow-asset"
                          key={setup.name}
                          onClick={() =>
                            replaceSetup(
                              applyExistingSetup(
                                state,
                                setup.name,
                                `Jayco setup: ${setup.name}`,
                                {
                                  scene_id: source.id,
                                  scene_mode: "place",
                                  brief: setup.brief,
                                  people: setup.people,
                                  props: setup.props,
                                  prop_ids: [],
                                },
                              ),
                            )
                          }
                        >
                          <img
                            src={source.thumbnail_url || source.url}
                            alt=""
                            loading="lazy"
                          />
                          <strong>{setup.name}</strong>
                          <small>{setup.people}</small>
                        </button>
                      ) : null;
                    })}
                  </div>
                  <label className="flow-field">
                    Reuse a previous campaign setup
                    <select
                      aria-label="Reuse a previous campaign setup"
                      value=""
                      onChange={(e) => void reuseCampaign(e.target.value)}
                    >
                      <option value="">Choose a saved campaign…</option>
                      {p.projects
                        .filter((c) => c.id !== p.project.id && c.landscape_id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <p>
                    A saved copy of the chosen campaign’s scene direction is
                    used. Its RV and output photos are not imported.
                  </p>
                  {mode !== "unselected" && (
                    <Button
                      variant="ghost"
                      onClick={() => setChoosingSetup(false)}
                    >
                      Keep current setup
                    </Button>
                  )}
                </section>
              )}
              {mode === "existing" &&
                !choosingSetup &&
                state.setup?.mode === "existing" && (
                  <section
                    className="flow-setup-card"
                    aria-label="Selected setup"
                  >
                    {scene && (
                      <OriginalPhoto src={scene.url} alt={scene.name} />
                    )}
                    <div>
                      <p className="flow-eyebrow">
                        EXISTING SETUP · SAVED COPY
                      </p>
                      <h3>{state.setup.name}</h3>
                      <p>
                        <b>RV for this shoot:</b>{" "}
                        {rv?.name || "Choose your RV in step 1"}
                      </p>
                      <dl>
                        <dt>Setting</dt>
                        <dd>{scene?.name}</dd>
                        <dt>Scene treatment</dt>
                        <dd>
                          {state.scene_mode === "place"
                            ? "Keep this location and camp setup"
                            : "Borrow the look, color and lifestyle"}
                        </dd>
                        <dt>People & activity</dt>
                        <dd>
                          {state.people ||
                            "Follow the people and activity in the reference, using only those needed in each frame."}
                        </dd>
                        <dt>Props & styling</dt>
                        <dd>
                          {state.props ||
                            "Follow the reference’s camp styling."}
                        </dd>
                        {!!state.prop_ids.length && (
                          <>
                            <dt>Object reference</dt>
                            <dd>
                              {
                                p.assets.find((a) => a.id === state.prop_ids[0])
                                  ?.name
                              }
                            </dd>
                          </>
                        )}
                        <dt>Photographic direction</dt>
                        <dd>
                          {state.brief ||
                            "Use the selected reference’s photographic character."}
                        </dd>
                      </dl>
                      <Button
                        variant="outline"
                        onClick={() => replaceSetup(customizeSetup(state))}
                      >
                        Customize this setup
                      </Button>
                      <p className="flow-help">
                        Customization creates an editable copy. The original
                        setup stays unchanged.
                      </p>
                    </div>
                  </section>
                )}
              {mode === "custom" && !choosingSetup && (
                <>
                  <div className="flow-note">
                    <strong>Custom setup</strong>
                    <p>
                      {state.setup?.mode === "custom" &&
                      state.setup.derived_from
                        ? `Based on ${state.setup.derived_from}. `
                        : ""}
                      Choose one setting, then define the people, props and
                      direction. Choosing a different setting clears the
                      previous direction and resets shot instructions.
                    </p>
                  </div>
                  <div className="flow-toolbar">
                    <Button
                      variant={
                        sceneSource === "library" ? "default" : "outline"
                      }
                      onClick={() => setSceneSource("library")}
                    >
                      Choose a setting
                    </Button>
                    <Button
                      variant={
                        sceneSource === "campaigns" ? "default" : "outline"
                      }
                      onClick={() => setSceneSource("campaigns")}
                    >
                      Photo from a previous campaign
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setDiscovery(!discovery)}
                    >
                      Find a real location
                    </Button>
                    <label className="flow-upload">
                      Upload setting
                      <input
                        aria-label="Upload setting"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={busy}
                        onChange={(e) =>
                          void upload(e.target.files?.[0], "landscape")
                        }
                      />
                    </label>
                  </div>
                  {discovery && (
                    <LandscapeDiscovery
                      onBack={() => setDiscovery(false)}
                      canUse
                      onImported={async (a, use) => {
                        await p.onRefresh();
                        if (use) {
                          chooseScene(a.id);
                          setDiscovery(false);
                        }
                      }}
                    />
                  )}
                  {sceneSource === "campaigns" && (
                    <p className="flow-help">
                      This uses one photo as a visual reference. To inherit the
                      complete scene direction, choose “Use an existing setup”
                      above.
                    </p>
                  )}
                  <Input
                    aria-label="Search settings"
                    placeholder="Search Jayco shoots, landscapes, locations…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <div className="flow-assets">
                    {p.assets
                      .filter((a) =>
                        sceneSource === "library"
                          ? a.kind === "landscape"
                          : !!a.project_id &&
                            [
                              "composition",
                              "lifestyle",
                              "campaign",
                              "variation",
                            ].includes(a.kind),
                      )
                      .filter(named)
                      .map((a) => (
                        <AssetChoice
                          key={a.id}
                          asset={a}
                          selected={a.id === state.scene_id}
                          onClick={() => chooseScene(a.id)}
                        />
                      ))}
                  </div>
                  <div className="flow-direction">
                    <label className="flow-field">
                      How to use the scene
                      <select
                        aria-label="How to use the scene"
                        value={state.scene_mode}
                        onChange={(e) =>
                          patch({
                            scene_mode: e.target.value as "look" | "place",
                          })
                        }
                      >
                        <option value="look">
                          Borrow the look, color and lifestyle
                        </option>
                        <option value="place">
                          Keep this location and camp setup
                        </option>
                      </select>
                    </label>
                    <label className="flow-field">
                      People & activity
                      <Textarea
                        aria-label="People & activity"
                        value={state.people}
                        onChange={(e) => patch({ people: e.target.value })}
                        placeholder="A couple sharing coffee, one person reading, a family returning from a walk… Use “No people” for a product-only shoot."
                      />
                    </label>
                    <label className="flow-field">
                      Props & styling
                      <Textarea
                        aria-label="Props & styling"
                        value={state.props}
                        onChange={(e) => patch({ props: e.target.value })}
                        placeholder="Two camp chairs, a woven blanket, coffee mugs. No bikes or pets."
                      />
                    </label>
                    <label className="flow-field">
                      Object reference (optional)
                      <select
                        aria-label="Object reference (optional)"
                        value={state.prop_ids[0] || ""}
                        onChange={(e) =>
                          patch({
                            prop_ids: e.target.value ? [e.target.value] : [],
                          })
                        }
                      >
                        <option value="">No object reference</option>
                        {p.assets
                          .filter((a) => a.kind === "prop")
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="flow-upload">
                      Upload object reference
                      <input
                        aria-label="Upload object reference"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={busy}
                        onChange={(e) =>
                          void upload(e.target.files?.[0], "prop")
                        }
                      />
                    </label>
                    <label className="flow-field flow-full">
                      Campaign direction
                      <Textarea
                        rows={5}
                        aria-label="Campaign direction"
                        value={state.brief}
                        onChange={(e) => patch({ brief: e.target.value })}
                        placeholder="Describe the audience, mood, season, lighting, color treatment and story. Your selected RV remains the product identity."
                      />
                    </label>
                  </div>
                </>
              )}
            </>
          )}
          {state.section === "plan" && (
            <>
              <div className="flow-note">
                {state.shots.length} requested photos · {completed.length} ready
                for the current brief · {selected.length} selected. Select all,
                then uncheck any photos you don’t need. Changing the brief keeps
                older versions in Results.
              </div>
              <div className="flow-toolbar">
                <label className="flow-field">
                  Choose deliverables
                  <select
                    aria-label="Choose deliverables"
                    value=""
                    onChange={(e) => {
                      const pack = shootPackages[Number(e.target.value)];
                      setSelected([]);
                      patch({
                        shots: pack.roles.map(
                          (id) =>
                            state.shots.find((s) => s.id === id) ||
                            plannedShot(id),
                        ),
                      });
                    }}
                  >
                    <option value="">Choose a campaign size…</option>
                    {shootPackages.map((pack, i) => (
                      <option key={pack.name} value={i}>
                        {pack.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="outline"
                  onClick={() => setSelected(state.shots.map((s) => s.id))}
                >
                  Select all
                </Button>
              </div>
              <div className="flow-shot-list">
                {state.shots.map((s, i) => {
                  const ready = completed.some((c) => c.id === s.id);
                  return (
                    <article className="flow-shot" key={s.id}>
                      <div className="flow-shot-top">
                        <label>
                          <input
                            type="checkbox"
                            checked={selected.includes(s.id)}
                            disabled={busy}
                            onChange={(e) => {
                              setSelected((ids) =>
                                e.target.checked
                                  ? [...ids, s.id]
                                  : ids.filter((id) => id !== s.id),
                              );
                            }}
                          />{" "}
                          <b>
                            {i + 1}. {s.label}
                          </b>
                        </label>
                        <span>{ready ? "Ready" : "Planned"}</span>
                      </div>
                      <p>
                        {photoshootShots.find((x) => x.id === s.role)?.usage ||
                          "Custom campaign deliverable"}{" "}
                        · {generationSizeLabel(s.aspect)}
                      </p>
                      <details>
                        <summary>Edit shot direction & format</summary>
                        <div className="flow-direction">
                          <label className="flow-field">
                            Shot name
                            <Input
                              aria-label="Shot name"
                              value={s.label}
                              onChange={(e) =>
                                shotUpdate(s.id, { label: e.target.value })
                              }
                            />
                          </label>
                          <label className="flow-field">
                            Image shape
                            <select
                              aria-label="Image shape"
                              value={s.aspect}
                              onChange={(e) =>
                                shotUpdate(s.id, {
                                  aspect: e.target
                                    .value as PlannedShot["aspect"],
                                })
                              }
                            >
                              {aspectOptions.map(([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flow-field flow-full">
                            Shot direction
                            <Textarea
                              rows={4}
                              aria-label="Shot direction"
                              readOnly={mode === "existing"}
                              value={s.direction}
                              onChange={(e) =>
                                shotUpdate(s.id, { direction: e.target.value })
                              }
                            />
                          </label>
                          {mode === "existing" && (
                            <p className="flow-full flow-help">
                              The setup supplies this shot’s direction.{" "}
                              <button
                                type="button"
                                className="underline"
                                onClick={() =>
                                  replaceSetup({
                                    ...customizeSetup(state),
                                    section: "scene",
                                  })
                                }
                              >
                                Customize this setup
                              </button>{" "}
                              to change its activities or styling.
                            </p>
                          )}
                        </div>
                        <div className="flow-toolbar">
                          <Button
                            variant="outline"
                            disabled={!i}
                            onClick={() => {
                              const shots = [...state.shots];
                              [shots[i - 1], shots[i]] = [
                                shots[i],
                                shots[i - 1],
                              ];
                              patch({ shots });
                            }}
                          >
                            Move earlier
                          </Button>
                          <Button
                            variant="outline"
                            disabled={state.shots.length === 1}
                            onClick={() => {
                              patch({
                                shots: state.shots.filter((x) => x.id !== s.id),
                              });
                              setSelected((ids) =>
                                ids.filter((id) => id !== s.id),
                              );
                            }}
                          >
                            Remove shot
                          </Button>
                        </div>
                      </details>
                    </article>
                  );
                })}
              </div>
              <div className="flow-toolbar">
                <label className="flow-field">
                  Add a shot
                  <select
                    aria-label="Add a shot"
                    value={catalog}
                    onChange={(e) => setCatalog(e.target.value)}
                  >
                    <option value="">Choose from 18 shot types…</option>
                    {photoshootShots
                      .filter((s) => !state.shots.some((x) => x.id === s.id))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label} · {s.format}
                        </option>
                      ))}
                  </select>
                </label>
                <Button
                  variant="outline"
                  disabled={!catalog || state.shots.length >= 30}
                  onClick={() => {
                    patch({ shots: [...state.shots, plannedShot(catalog)] });
                    setCatalog("");
                  }}
                >
                  Add shot
                </Button>
                <Button
                  variant="outline"
                  disabled={state.shots.length >= 30}
                  onClick={() =>
                    patch({
                      ...customizeSetup(state),
                      shots: [
                        ...state.shots,
                        {
                          ...plannedShot("portrait"),
                          id: crypto.randomUUID(),
                          role: "custom",
                          label: "Custom shot",
                          direction:
                            "Describe the framing, activity, camera angle and purpose of this shot.",
                        },
                      ],
                    })
                  }
                >
                  {mode === "existing"
                    ? "Customize setup & add a shot"
                    : "Add custom shot"}
                </Button>
              </div>
              <div className="flow-generation">
                <div>
                  <strong>
                    {completed.length} of {state.shots.length} campaign photos
                    ready · {selected.length} selected next
                  </strong>
                  <p>
                    <b>{rv?.name || "Choose an RV"}</b> ·{" "}
                    {state.setup?.mode === "existing"
                      ? state.setup.name
                      : "Custom setup"}{" "}
                    · {scene?.name || "Choose a setting"}
                  </p>
                  {setupProblem(state) && (
                    <p role="alert">{setupProblem(state)}</p>
                  )}
                  <p>
                    Generate the selected photos in one run. Each checked shot
                    creates one new paid image; unchecked shots are not
                    generated.
                  </p>
                  {!!selected.filter((id) => completed.some((s) => s.id === id))
                    .length && (
                    <p>
                      Selected shots that already have photos will get new
                      versions. Existing photos are kept.
                    </p>
                  )}
                  {!rv || !scene ? (
                    <p>Choose an RV and setting before generating.</p>
                  ) : null}
                </div>
                <Button
                  disabled={
                    busy ||
                    !!pending ||
                    running ||
                    !rv ||
                    !scene ||
                    !!setupProblem(state) ||
                    !selected.length
                  }
                  onClick={() => void generate()}
                >
                  {busy
                    ? "Preparing…"
                    : running
                      ? "Generation in progress…"
                      : `Generate ${selected.length || ""} selected photos`}
                </Button>
              </div>
            </>
          )}
          {state.section === "results" && (
            <>
              <div className="flow-toolbar">
                <Button
                  onClick={() => {
                    patch({ section: "plan" });
                    setSelected(
                      state.shots
                        .filter((s) => !completed.some((c) => c.id === s.id))
                        .map((s) => s.id),
                    );
                  }}
                >
                  Continue shoot
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setAdvanced(!advanced)}
                >
                  Refine images & manage gallery
                </Button>
                <span>
                  {jobs.filter((x) => x.job.status === "ready").length}{" "}
                  generated photos across all versions
                </span>
              </div>
              {running && (
                <p role="status">
                  Your selected photos are submitted together. The image provider
                  queues and renders them as capacity becomes available.
                  Progress is saved when you return.
                </p>
              )}
              <div className="flow-results">
                {state.shots.map((s) => {
                  const versions = jobs
                    .filter((x) => x.job.shot_id === s.id)
                    .sort((a, b) => b.job.created_at - a.job.created_at);
                  return (
                    <article key={s.id} className="flow-result">
                      <div className="flow-shot-top">
                        <h3>{s.label}</h3>
                        <span>
                          {versions.length}{" "}
                          {versions.length === 1 ? "version" : "versions"}
                        </span>
                      </div>
                      <Button
                        className="flow-new-version"
                        variant="outline"
                        onClick={() => {
                          patch({ section: "plan" });
                          setSelected([s.id]);
                        }}
                      >
                        Plan a new version
                      </Button>
                      {!versions.length && (
                        <div className="flow-placeholder">
                          Planned ·{" "}
                          {aspectOptions.find(([key]) => key === s.aspect)?.[1]}
                        </div>
                      )}
                      {versions.map(({ batch, job, asset }, i) => (
                        <div className="flow-version" key={job.id}>
                          {asset ? (
                            <>
                              <button
                                aria-label={
                                  "Review " +
                                  s.label +
                                  " version " +
                                  (versions.length - i)
                                }
                                onClick={() => setReview(asset)}
                              >
                                <OriginalPhoto
                                  src={asset.url}
                                  alt={asset.name}
                                />
                              </button>
                              <div className="flow-version-meta">
                                <span>
                                  v{versions.length - i} ·{" "}
                                  {asset.approved ? "Approved" : "Draft"} ·{" "}
                                  {asset.width} × {asset.height}
                                </span>
                                <small>
                                  {matchingShot(batch, s, state)
                                    ? "Current brief"
                                    : "Earlier brief / legacy shoot"}
                                </small>
                              </div>
                              <div className="flow-toolbar">
                                <Button
                                  variant="outline"
                                  onClick={() => setReview(asset)}
                                >
                                  Review & approve
                                </Button>
                                <Button
                                  variant="ghost"
                                  onClick={() => {
                                    try {
                                      if (batch.workflow_json) {
                                        const prior = flowSchema.parse(
                                          JSON.parse(batch.workflow_json),
                                        );
                                        replaceSetup({
                                          ...applyExistingSetup(
                                            state,
                                            `${p.project.name} — saved take`,
                                            `Batch ${batch.id}`,
                                            sceneSetup(prior),
                                          ),
                                          section: "scene",
                                        });
                                      } else {
                                        const refs = JSON.parse(
                                          batch.inputs_json,
                                        ) as string[];
                                        patch({
                                          setup: {
                                            mode: "custom",
                                            name: "Custom setup",
                                            derived_from:
                                              "Earlier take — review imported direction",
                                          },
                                          scene_id: refs[1] ?? null,
                                          identity_ids: [],
                                          prop_ids: [],
                                          brief: batch.prompt,
                                          people: "",
                                          props: "",
                                          section: "scene",
                                        });
                                      }
                                    } catch {
                                      setError(
                                        "This earlier setup cannot be restored. Choose its references manually.",
                                      );
                                    }
                                  }}
                                >
                                  Reuse this setup
                                </Button>
                              </div>
                            </>
                          ) : (
                            <p>
                              {job.status === "waiting"
                                ? "In line — starts automatically"
                                : job.status}
                              {job.error ? ": " + job.error : ""}
                              {["failed", "save_failed"].includes(
                                job.status,
                              ) && (
                                <Button
                                  variant="outline"
                                  onClick={async () => {
                                    try {
                                      const b = await call<Batch>(
                                        "jobs/" + job.id + "/retry",
                                        {},
                                      );
                                      p.onBatch(b);
                                    } catch (e) {
                                      setError((e as Error).message);
                                    }
                                  }}
                                >
                                  Retry this image
                                </Button>
                              )}
                            </p>
                          )}
                        </div>
                      ))}
                    </article>
                  );
                })}
              </div>
              <details className="flow-legacy">
                <summary>
                  Other campaign images and earlier takes (
                  {
                    p.assets.filter(
                      (a) =>
                        a.project_id === p.project.id &&
                        !jobs.some(
                          (j) =>
                            j.job.shot_id &&
                            state.shots.some((s) => s.id === j.job.shot_id) &&
                            j.asset?.id === a.id,
                        ) &&
                        !["rv", "landscape", "prop"].includes(a.kind),
                    ).length
                  }
                  )
                </summary>
                <div className="flow-assets">
                  {p.assets
                    .filter(
                      (a) =>
                        a.project_id === p.project.id &&
                        !jobs.some(
                          (j) =>
                            j.job.shot_id &&
                            state.shots.some((s) => s.id === j.job.shot_id) &&
                            j.asset?.id === a.id,
                        ) &&
                        !["rv", "landscape", "prop"].includes(a.kind),
                    )
                    .map((a) => (
                      <AssetChoice
                        key={a.id}
                        asset={a}
                        selected={false}
                        onClick={() => setReview(a)}
                      />
                    ))}
                </div>
              </details>
              {(advanced || review) && (
                <div className="flow-refine">
                  <div className="flow-toolbar">
                    <h3>Review & image refinements</h3>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setAdvanced(false);
                        setReview(null);
                      }}
                    >
                      Close refinements
                    </Button>
                  </div>
                  <CampaignWorkspace
                    key={review?.id || "gallery"}
                    embedded
                    initialInspect={review}
                    project={{
                      ...p.project,
                      rv_id: state.rv_id,
                      landscape_id: state.scene_id,
                    }}
                    assets={p.assets}
                    batches={p.batches}
                    modelPacks={p.modelPacks}
                    onNav={p.onNav}
                    onRefresh={p.onRefresh}
                    onBatch={p.onBatch}
                    onWizard={p.onTools}
                    onPhotoshoot={() => patch({ section: "plan" })}
                  />
                </div>
              )}
            </>
          )}
          {state.section !== "results" && (
            <footer className="flow-footer">
              <Button variant="outline" onClick={() => void leave(p.onTools)}>
                Advanced image tools
              </Button>
              <Button
                disabled={
                  busy ||
                  (state.section === "rv" && !rv) ||
                  (state.section === "scene" &&
                    (!scene || !!setupProblem(state) || choosingSetup))
                }
                onClick={() =>
                  patch({
                    section:
                      flowSections[flowSections.indexOf(state.section) + 1],
                  })
                }
              >
                {state.section === "rv"
                  ? "Continue to scene"
                  : state.section === "scene"
                    ? "Continue to shoot plan"
                    : "View results"}
              </Button>
            </footer>
          )}
        </fieldset>
      </main>
    </div>
  );
}

function AssetChoice({
  asset: a,
  selected,
  onClick,
}: {
  asset: Asset;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={"flow-asset " + (selected ? "chosen" : "")}
      aria-pressed={selected}
      onClick={onClick}
    >
      <img src={a.thumbnail_url || a.url} alt={a.name} loading="lazy" />
      <span>{a.name}</span>
      <small>
        {a.source === "generated" ? "Generated reference" : "Original photo"}
        {selected ? " · Selected" : ""}
      </small>
    </button>
  );
}
