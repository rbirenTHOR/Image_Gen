"use client";
import { useEffect, useRef, useState } from "react";
import {
  Mountain,
  ArrowLeft,
  ArrowUp,
  Plus,
  Check,
  Bookmark,
  Images,
  MessageSquare,
  Sparkles,
  X,
  Expand,
  RefreshCw,
  LoaderCircle,
  Download,
  SlidersHorizontal,
  Upload,
  ImagePlus,
  ChevronRight,
  Send,
  Copy,
} from "lucide-react";
import { photoshootShots } from "@/lib/photoshoot";
import { OriginalPhoto } from "@/components/original-photo";
import { PhotoSource } from "@/components/photo-source";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { readCampaignDraft, writeCampaignDraft } from "@/lib/campaign-draft";
import {
  campaignPresets,
  getCampaignPreset,
  resolveCampaignPreset,
} from "@/lib/campaign-presets";
import {
  activeStatus,
  generationSizeLabel,
  realismRefinement,
  type Asset,
  type Project,
  type Batch,
  type CampaignTurn,
  type CampaignData,
  type ModelPack,
  selectModelPackReferences,
} from "@/lib/domain";
async function api<T>(
  path: string,
  data?: unknown,
  method?: string,
): Promise<T> {
  const r = await fetch("/api/studio/" + path, {
    method: method ?? (data === undefined ? "GET" : "POST"),
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const v = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(v.error || "This action did not complete.");
  return v;
}
const fail = (e: unknown) =>
  toast.error(e instanceof Error ? e.message : "This action did not complete.");
const parseRefs = (t: CampaignTurn): string[] => JSON.parse(t.references_json);
function Photo({ asset }: { asset: Asset }) {
  const [state, setState] = useState("loading"),
    [revision, setRevision] = useState(0);
  return (
    <div className="campaign-photo">
      <img
        src={(asset.thumbnail_url || asset.url) + (revision ? "?preview=" + revision : "")}
        alt={asset.name}
        loading="lazy"
        onLoad={() => setState("ready")}
        onError={() => setState("failed")}
      />
      {state !== "ready" && (
        <div className="campaign-photo-status">
          {state === "failed" ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setState("loading");
                setRevision((v) => v + 1);
              }}
            >
              <RefreshCw />
              Retry image
            </Button>
          ) : (
            <>
              <Skeleton className="absolute inset-0" />
              <LoaderCircle className="spinner" />
            </>
          )}
        </div>
      )}
    </div>
  );
}
function Aspect({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label="Generation format">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="landscape_4_3">Landscape · 4:3</SelectItem>
        <SelectItem value="landscape_16_9">Wide · 16:9</SelectItem>
        <SelectItem value="square_hd">Square · 1:1</SelectItem>
        <SelectItem value="portrait_4_3">Portrait · 3:4</SelectItem>
        <SelectItem value="portrait_4_5">Feed · 4:5</SelectItem>
        <SelectItem value="portrait_9_16">Story · 9:16</SelectItem>
      </SelectContent>
    </Select>
  );
}
function StudioHeader({
  onNav,
  children,
}: {
  onNav: (v: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <header className="campaign-topbar">
      <button
        className="brand"
        onClick={() => onNav("campaigns")}
        aria-label="THOR Studio campaigns"
      >
        <Mountain />
        THOR STUDIO
      </button>
      <nav aria-label="Studio navigation">
        <button onClick={() => onNav("inventory")}>RV Inventory</button>
        <button onClick={() => onNav("library")}>Asset Library</button>
        <button className="active" onClick={() => onNav("campaigns")}>
          Campaigns
        </button>
      </nav>
      {children && <div className="campaign-topbar-actions">{children}</div>}
    </header>
  );
}
export function CampaignHome({
  projects,
  assets,
  onOpen,
  onNew,
  onNav,
}: {
  projects: Project[];
  assets: Asset[];
  onOpen: (id: string) => void;
  onNew: (presetId: string) => Promise<void>;
  onNav: (v: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [presetId, setPresetId] = useState("blank");
  const [creating, setCreating] = useState(false);
  const preset = getCampaignPreset(presetId)!;
  const resolved = resolveCampaignPreset(preset, assets);
  return (
    <div className="campaign-mode">
      <StudioHeader onNav={onNav} />
      <main className="campaign-home">
        <div className="campaign-home-heading">
          <div>
            <p className="campaign-kicker">YOUR CREATIVE WORKSPACE</p>
            <h1>Make room for the next idea.</h1>
            <p>Every image, every direction. Together in one campaign.</p>
          </div>
          <Button onClick={() => setNewOpen(true)}>
            <Plus />
            New campaign
          </Button>
        </div>
        <div className="campaign-home-tools">
          <h2>
            Campaigns <span>{projects.length}</span>
          </h2>
          <Input
            aria-label="Search campaigns"
            placeholder="Find a campaign…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="campaign-boards">
          {projects
            .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
            .map((p) => {
              const saved = assets.filter((a) =>
                a.campaign_ids?.includes(p.id),
              );
              const previews = (
                saved.length
                  ? saved
                  : assets.filter(
                      (a) =>
                        a.id === p.current_id ||
                        a.id === p.rv_id ||
                        a.id === p.landscape_id,
                    )
              ).slice(0, 3);
              return (
                <button
                  key={p.id}
                  className="campaign-board"
                  onClick={() => onOpen(p.id)}
                >
                  <div className={"board-mosaic count-" + previews.length}>
                    {previews.length ? (
                      previews.map((a) => (
                        <img key={a.id} src={a.thumbnail_url || a.url} alt={a.name} />
                      ))
                    ) : (
                      <div className="board-empty">
                        <Images />
                        <span>Your next campaign starts here</span>
                      </div>
                    )}
                    <span className="board-open">
                      <ArrowUp />
                    </span>
                  </div>
                  <div className="board-caption">
                    <div>
                      <h3>{p.name}</h3>
                      <p>
                        {p.saved_count ?? saved.length} saved images ·{" "}
                        {new Date(p.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <MessageSquare size={19} />
                  </div>
                </button>
              );
            })}
        </div>
        {!projects.filter((p) =>
          p.name.toLowerCase().includes(search.toLowerCase()),
        ).length && (
          <div className="campaign-empty-state">
            <Images />
            <h2>No campaigns found</h2>
            <Button variant="outline" onClick={() => setSearch("")}>
              Clear search
            </Button>
          </div>
        )}
      </main>
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose a campaign setup</DialogTitle>
            <DialogDescription>
              Start from an approved product and lifestyle recipe, or build one yourself.
            </DialogDescription>
          </DialogHeader>
          <Select value={presetId} onValueChange={setPresetId}>
            <SelectTrigger aria-label="Campaign setup">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {campaignPresets.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="campaign-preset-summary">
            <strong>{preset.description}</strong>
            <span>{preset.rvLabel}</span>
            <span>{preset.styleLabel}</span>
            {preset.id === "blank" ? (
              <small>Choose an RV, scene and shoot plan in your campaign workspace.</small>
            ) : (
              <>
              <small>{preset.mode === "lifestyle" ? `${photoshootShots.length} shot roles · 2 per pass · web, editorial, social & Stories` : `${preset.count} takes · ${generationSizeLabel(preset.aspect)}`}</small>
              <small>
                {resolved.rv && resolved.landscape
                  ? "Ready · product and Dropbox style reference found"
                  : `Setup needed · ${!resolved.rv ? "Eagle RV reference" : ""}${!resolved.rv && !resolved.landscape ? " and " : ""}${!resolved.landscape ? preset.styleLabel : ""} missing`}
              </small>
              </>
            )}
          </div>
          <Button
            disabled={creating}
            onClick={async () => {
              setCreating(true);
              try {
                await onNew(presetId);
                setNewOpen(false);
              } finally {
                setCreating(false);
              }
            }}
          >
            {creating ? <LoaderCircle className="spinner" /> : <Plus />}
            Start campaign
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default function CampaignWorkspace({
  project,
  assets,
  batches,
  modelPacks,
  onNav,
  onRefresh,
  onBatch,
  onWizard,
  onPhotoshoot,
  embedded = false,
  initialInspect = null,
}: {
  project: Project;
  assets: Asset[];
  batches: Batch[];
  modelPacks: ModelPack[];
  onNav: (v: string) => void;
  onRefresh: () => Promise<unknown>;
  onBatch: (b: Batch) => void;
  onWizard: () => void;
  onPhotoshoot: () => void;
  embedded?: boolean;
  initialInspect?: Asset | null;
}) {
  const [data, setData] = useState<CampaignData>({ saved_ids: [], turns: [] }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [tab, setTab] = useState("saved"),
    [mobilePanel, setMobilePanel] = useState("gallery"),
    [selected, setSelected] = useState<string[]>([]),
    [refs, setRefs] = useState<string[]>([]),
    [text, setText] = useState(""),
    [draftReady, setDraftReady] = useState(false),
    [sending, setSending] = useState(false),
    [generating, setGenerating] = useState<string | null>(null),
    [promptEdits, setPromptEdits] = useState<Record<string, string>>({}),
    [aspects, setAspects] = useState<Record<string, string>>({}),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [picker, setPicker] = useState<"save" | "refs" | null>(null),
    [picked, setPicked] = useState<string[]>([]),
    [pickerQuery, setPickerQuery] = useState(""),
    [saving, setSaving] = useState(false),
    [savingPack, setSavingPack] = useState(false),
    [uploadProgress, setUploadProgress] = useState(""),
    [inspect, setInspect] = useState<Asset | null>(initialInspect),
    [actual, setActual] = useState(false),
    [compare, setCompare] = useState(false),
    [checks, setChecks] = useState({ rv: false, scene: false, crop: false }),
    [rename, setRename] = useState(project.name === "Untitled campaign"),
    [name, setName] = useState(project.name);
  const chatEnd = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    alive = useRef(true);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const savedSet = new Set(data.saved_ids),
    projectAssets = assets.filter(
      (a) => a.project_id === project.id || savedSet.has(a.id),
    );
  const gallery =
    tab === "saved"
      ? data.saved_ids.map((id) => byId.get(id)).filter((a): a is Asset => !!a)
      : projectAssets;
  async function reload() {
    const next = await api<CampaignData>("projects/" + project.id + "/gallery");
    if (alive.current) setData(next);
    await onRefresh();
    return next;
  }
  useEffect(() => {
    alive.current = true;
    const draft = readCampaignDraft(project.id);
    if (draft) {
      setText(draft.text);
      setRefs(draft.refs);
      setPromptEdits(draft.promptEdits);
      setAspects(draft.aspects);
      setCounts(draft.counts);
    }
    reload()
      .then((next) => {
        const latest = next.turns.at(-1);
        if (alive.current && latest && !draft) setRefs(parseRefs(latest));
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (alive.current) {
          setLoading(false);
          setDraftReady(true);
        }
      });
    return () => {
      alive.current = false;
    };
  }, [project.id]);
  useEffect(() => {
    if (!draftReady) return;
    // Preserve only unsent prompt edits. Submitted directions come from the server.
    const pending = new Set(
      data.turns.filter((t) => !t.batch_id).map((t) => t.id),
    );
    writeCampaignDraft(project.id, {
      text,
      refs,
      promptEdits: Object.fromEntries(
        Object.entries(promptEdits).filter(([id]) => pending.has(id)),
      ),
      counts: Object.fromEntries(Object.entries(counts).filter(([id]) => pending.has(id))),
      aspects: Object.fromEntries(
        Object.entries(aspects).filter(([id]) => pending.has(id)),
      ),
    });
  }, [project.id, draftReady, text, refs, promptEdits, aspects, counts, data.turns]);
  useEffect(() => {
    if (!data.turns.some((t) => t.status === "planning")) return;
    const timer = setInterval(() => reload().catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, [data.turns]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [data.turns.length, sending]);
  const busyJobs = batches
    .flatMap((b) => b.jobs)
    .filter((j) => activeStatus(j.status));
  function toggle(id: string) {
    setSelected((v) =>
      v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
    );
  }
  async function save(ids: string[], saved = true) {
    if (!ids.length) return false;
    setSaving(true);
    try {
      const next = await api<CampaignData>(
        "projects/" + project.id + "/gallery",
        { asset_ids: ids, saved },
      );
      setData(next);
      await onRefresh();
      setSelected([]);
      toast.success(
        saved
          ? `${ids.length} ${ids.length === 1 ? "image" : "images"} saved to campaign`
          : "Removed from gallery. Original images are retained.",
      );
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setSaving(false);
    }
  }
  function riff(ids: string[]) {
    if (ids.length > 4)
      return toast.error(
        "Choose up to four reference images. The first will be the base.",
      );
    setRefs(ids);
    setMobilePanel("chat");
    composer.current?.focus();
  }
  async function applyModelPack(packId: string) {
    try {
      if (packId === "none") {
        await api<Project>(
          "projects/" + project.id,
          { model_pack_id: null },
          "PATCH",
        );
        await onRefresh();
        toast.success(
          "Model pack disconnected. Attached references are unchanged.",
        );
        return;
      }
      const pack = modelPacks.find((item) => item.id === packId);
      if (!pack) return;
      const baseId = refs[0] || project.current_id || project.rv_id;
      const base = baseId ? byId.get(baseId) : undefined;
      const next = selectModelPackReferences(
        pack.assets,
        baseId,
        base?.angle || "",
      );
      if (!next.length)
        throw new Error(
          "This model pack has no approved generation references.",
        );
      await api<Project>(
        "projects/" + project.id,
        { model_pack_id: pack.id },
        "PATCH",
      );
      setRefs(next);
      await onRefresh();
      toast.success(
        `${pack.name} attached with ${next.length} reference${next.length === 1 ? "" : "s"}.`,
      );
    } catch (e) {
      fail(e);
    }
  }
  async function saveReferencesAsPack() {
    if (!refs.length || savingPack) return;
    setSavingPack(true);
    try {
      const first = byId.get(refs[0]);
      const label = [first?.year, first?.brand, first?.model]
        .filter(Boolean)
        .join(" ");
      const pack = await api<ModelPack>("model-packs", {
        name: label || `${project.name} references`,
        brand: first?.brand || "",
        model: first?.model || "",
        model_year: first?.year || "",
        assets: refs.map((asset_id, index) => ({
          asset_id,
          role: index === 0 ? "base" : "identity",
          priority: index,
          view: byId.get(asset_id)?.angle || "",
        })),
      });
      await api<Project>(
        "projects/" + project.id,
        { model_pack_id: pack.id },
        "PATCH",
      );
      await onRefresh();
      toast.success(`${pack.name} saved as a reusable model pack.`);
    } catch (e) {
      fail(e);
    } finally {
      setSavingPack(false);
    }
  }
  function openImage(a: Asset) {
    setInspect(a);
    setChecks({ rv: false, scene: false, crop: false });
    setActual(false);
    setCompare(false);
  }
  async function send() {
    if (!text.trim() || sending || loading) return;
    const message = text.trim(),
      references = [...refs],
      id = crypto.randomUUID();
    setSending(true);
    setError("");
    try {
      await api<CampaignTurn>("projects/" + project.id + "/chat", {
        id,
        text: message,
        reference_ids: references,
      });
      await reload();
      setText((current) => (current.trim() === message ? "" : current));
    } catch (e) {
      try {
        const next = await reload();
        if (next.turns.some((t) => t.id === id))
          setText((current) => (current.trim() === message ? "" : current));
        else fail(e);
      } catch {
        fail(e);
      }
    } finally {
      setSending(false);
    }
  }
  async function generate(t: CampaignTurn) {
    if (generating) return;
    setGenerating(t.id);
    try {
      const b = await api<Batch>(
        "projects/" + project.id + "/chat/" + t.id + "/generate",
        {
          prompt: promptEdits[t.id] ?? t.prompt,
          aspect: aspects[t.id] ?? t.aspect,
          count: counts[t.id] ?? 2,
        },
      );
      onBatch(b);
      await reload();
      setTab("all");
      toast.success(`${b.jobs.length} Max image request${b.jobs.length === 1 ? "" : "s"} started`);
    } catch (e) {
      try {
        const b = await api<Batch>("batches/" + t.id);
        onBatch(b);
        await reload();
        setTab("all");
      } catch {
        fail(e);
      }
    } finally {
      setGenerating(null);
    }
  }
  async function retryChat(t: CampaignTurn) {
    setSending(true);
    try {
      await api("projects/" + project.id + "/chat/" + t.id + "/retry", {});
      await reload();
    } catch (e) {
      fail(e);
    } finally {
      setSending(false);
    }
  }
  async function retryImage(id: string) {
    try {
      onBatch(await api<Batch>("jobs/" + id + "/retry", {}));
      await onRefresh();
    } catch (e) {
      fail(e);
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    if (list.length > 10)
      return toast.error("Upload up to 10 images at a time.");
    const ids: string[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        if (f.size > 12 * 1024 * 1024)
          throw new Error(f.name + " is over 12 MB.");
        setUploadProgress(`Uploading ${i + 1} of ${list.length}…`);
        const form = new FormData();
        form.set("file", f);
        form.set("kind", "campaign");
        form.set(
          "name",
          f.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Campaign image",
        );
        const r = await fetch("/api/studio/assets", {
          method: "POST",
          body: form,
        });
        const a = (await r.json()) as Asset & { error?: string };
        if (!r.ok) throw new Error(a.error || "Upload failed");
        ids.push(a.id);
      }
    } catch (e) {
      fail(e);
    } finally {
      if (ids.length) await save(ids);
      setUploadProgress("");
      await onRefresh();
      setPicker(null);
    }
  }
  async function approveImage() {
    if (!inspect) return;
    setSaving(true);
    try {
      await api("projects/" + project.id + "/approve-image", {
        asset_id: inspect.id,
        checks,
      });
      await onRefresh();
      setInspect({ ...inspect, approved: 1 });
      toast.success("Image approved for export");
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }
  const suggested = [
    "Make the light warmer and more natural",
    "Explore a fresh campaign direction",
    "Suggest three ways to improve this picture",
  ];
  function turnResults(t: CampaignTurn) {
    const b = batches.find((b) => b.id === t.batch_id);
    if (!b && !generating) return null;
    return (
      <div className="chat-results">
        {(
          b?.jobs ??
          (generating === t.id
            ? Array.from({length:counts[t.id] ?? 2}, (_,slot) => ({
                id: "pending" + slot,
                status: "submitting",
                result_asset_id: null,
                error: null,
              }))
            : [])
        ).map((j) => {
          const a = byId.get(j.result_asset_id ?? "");
          return (
            <div className="chat-result" key={j.id}>
              {a ? (
                <>
                  <div className="chat-result-preview">
                    <Photo asset={a} />
                    <button
                      className="image-open-target"
                      aria-label={"Inspect " + a.name}
                      onClick={() => openImage(a)}
                    />
                  </div>
                  <button
                    className={savedSet.has(a.id) ? "is-saved" : ""}
                    aria-label={
                      (savedSet.has(a.id) ? "Saved " : "Save ") + a.name
                    }
                    disabled={saving || savedSet.has(a.id)}
                    onClick={() => save([a.id])}
                  >
                    {savedSet.has(a.id) ? (
                      <Check size={14} />
                    ) : (
                      <Plus size={14} />
                    )}
                    Save
                  </button>
                </>
              ) : (
                <div className="chat-job" aria-live="polite">
                  {activeStatus(j.status) ? (
                    <LoaderCircle className="spinner" size={18} />
                  ) : (
                    <ImagePlus size={18} />
                  )}
                  <span>
                    {j.status === "save_failed"
                      ? "Save interrupted"
                      : j.status === "unknown"
                        ? "Check request"
                        : j.status === "ready"
                          ? "Loading"
                          : j.status}
                  </span>
                  {["failed", "save_failed"].includes(j.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => retryImage(j.id)}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {b && b.jobs.some((j) => j.result_asset_id) && (
          <Button
            className="save-all-results"
            variant="outline"
            size="sm"
            onClick={() =>
              save(
                b.jobs
                  .map((j) => j.result_asset_id)
                  .filter((id): id is string => !!id && !savedSet.has(id)),
              )
            }
            disabled={
              saving ||
              b.jobs.every(
                (j) => !j.result_asset_id || savedSet.has(j.result_asset_id),
              )
            }
          >
            <Bookmark />
            Save completed images
          </Button>
        )}
        {b && (
          <details className="chat-job-details">
            <summary>Generation status & details</summary>
            <p>
              {b.jobs.filter((j) => j.status === "ready").length} of {b.jobs.length} ready ·
              Sunburst Max
            </p>
            {b.jobs.map((j) => (
              <p key={j.id}>
                Take {j.slot + 1}: {j.status}
                {j.error && <span>{j.error}</span>}
                {j.request_id && <code>{j.request_id}</code>}
              </p>
            ))}
          </details>
        )}
      </div>
    );
  }
  return (
    <div className="campaign-mode">
      {!embedded && <StudioHeader onNav={onNav}>
        <Button onClick={onPhotoshoot}>Plan photoshoot</Button>
        <Button variant="outline" onClick={onWizard}>
          <SlidersHorizontal />
          Build a scene
        </Button>
      </StudioHeader>}
      <div className="campaign-mobile-switch">
        <Tabs value={mobilePanel} onValueChange={setMobilePanel}>
          <TabsList>
            <TabsTrigger
              value="gallery"
              id="campaign-gallery-tab"
              aria-controls="campaign-gallery"
            >
              <Images />
              Gallery
            </TabsTrigger>
            <TabsTrigger
              value="chat"
              id="campaign-chat-tab"
              aria-controls="campaign-chat"
            >
              <MessageSquare />
              Creative chat
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className={"campaign-workspace mobile-" + mobilePanel}>
        <main
          className="campaign-gallery"
          id="campaign-gallery"
          role="tabpanel"
          aria-labelledby="campaign-gallery-tab"
        >
          <div className="campaign-breadcrumb">
            <button onClick={() => onNav("campaigns")}>
              <ArrowLeft size={15} />
              Campaigns
            </button>
            <ChevronRight size={13} />
            <span>Workspace</span>
          </div>
          <div className="campaign-title-row">
            <div>
              {rename ? (
                <Input
                  aria-label="Rename campaign"
                  autoFocus
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      setName(project.name);
                      setRename(false);
                    }
                  }}
                  onBlur={async () => {
                    setRename(false);
                    if (!name.trim() || name === project.name) return;
                    try {
                      await api(
                        "projects/" + project.id,
                        { name: name.trim() },
                        "PATCH",
                      );
                      await onRefresh();
                    } catch (e) {
                      fail(e);
                    }
                  }}
                />
              ) : (
                <h1>
                  <button
                    onClick={() => setRename(true)}
                    title="Rename campaign"
                  >
                    {project.name}
                  </button>
                </h1>
              )}
              <p>
                {data.saved_ids.length} saved{" "}
                {data.saved_ids.length === 1 ? "image" : "images"}
                {busyJobs.length > 0 && (
                  <span className="generation-count">
                    <LoaderCircle className="spinner" size={13} />
                    {busyJobs.length} generating
                  </span>
                )}
              </p>
            </div>
            <Button
              onClick={() => {
                setPicked([]);
                setPickerQuery("");
                setPicker("save");
              }}
            >
              <Plus />
              Add images
            </Button>
          </div>
          <div className="gallery-toolbar">
            <Tabs
              value={tab}
              onValueChange={(v) => {
                setTab(v);
                setSelected([]);
              }}
            >
              <TabsList variant="line">
                <TabsTrigger
                  value="saved"
                  id="gallery-tab-saved"
                  aria-controls="campaign-results"
                >
                  Saved <span>{data.saved_ids.length}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="all"
                  id="gallery-tab-all"
                  aria-controls="campaign-results"
                >
                  All takes <span>{projectAssets.length}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="ghost"
              size="sm"
              disabled={!gallery.length}
              onClick={() =>
                setSelected(
                  selected.length === gallery.length
                    ? []
                    : gallery.map((a) => a.id),
                )
              }
            >
              {selected.length === gallery.length && gallery.length
                ? "Clear selection"
                : "Select all"}
            </Button>
          </div>
          <div
            id="campaign-results"
            role="tabpanel"
            aria-labelledby={"gallery-tab-" + tab}
          >
            {error && (
              <div className="campaign-error" role="alert">
                {error}
                <Button
                  variant="ghost"
                  onClick={() =>
                    reload()
                      .then(() => setError(""))
                      .catch(fail)
                  }
                >
                  Reconnect
                </Button>
              </div>
            )}
            {selected.length > 0 && (
              <div className="gallery-selection">
                <strong>{selected.length} selected</strong>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => riff(selected)}
                  disabled={selected.length > 4}
                >
                  <Sparkles />
                  Use as references
                </Button>
                <Button
                  size="sm"
                  onClick={() => save(selected)}
                  disabled={saving}
                >
                  <Bookmark />
                  Save to campaign
                </Button>
                {tab === "saved" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => save(selected, false)}
                    disabled={saving}
                  >
                    Remove
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Clear selected images"
                  onClick={() => setSelected([])}
                >
                  <X />
                </Button>
              </div>
            )}
            {loading ? (
              <div className="campaign-gallery-grid">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton className="h-64" key={i} />
                ))}
              </div>
            ) : gallery.length ? (
              <div className="campaign-gallery-grid">
                {gallery.map((a) => (
                  <article
                    className={
                      "campaign-image-card " +
                      (selected.includes(a.id) ? "checked" : "")
                    }
                    key={a.id}
                  >
                    <div className="campaign-image-visual" style={a.width && a.height ? {aspectRatio: `${a.width} / ${a.height}`} : undefined}>
                      <Photo asset={a} />
                      <button
                        className="image-open-target"
                        aria-label={"Inspect " + a.name}
                        onClick={() => openImage(a)}
                      />
                      <div className="image-selection-checkbox">
                        <Checkbox
                          aria-label={"Select " + a.name}
                          checked={selected.includes(a.id)}
                          onCheckedChange={() => toggle(a.id)}
                        />
                      </div>
                      <button
                        className={
                          "image-save-button " +
                          (savedSet.has(a.id) ? "is-saved" : "")
                        }
                        aria-label={
                          (savedSet.has(a.id) ? "Remove saved " : "Save ") +
                          a.name
                        }
                        disabled={saving}
                        onClick={() => save([a.id], !savedSet.has(a.id))}
                      >
                        {savedSet.has(a.id) ? (
                          <Bookmark fill="currentColor" size={17} />
                        ) : (
                          <Bookmark size={17} />
                        )}
                      </button>
                      {a.approved === 1 && (
                        <span className="image-approved">
                          <Check size={12} />
                          Approved
                        </span>
                      )}
                      <button
                        className="riff-button"
                        onClick={() => riff([a.id])}
                      >
                        <Sparkles size={15} />
                        Riff on this
                      </button>
                    </div>
                    <div className="campaign-image-caption">
                      <strong>{a.name}</strong>
                      <span>
                        {a.parent_id
                          ? "Variation"
                          : a.source === "uploaded"
                            ? "Uploaded"
                            : a.source === "ai-sample"
                              ? "AI sample"
                              : a.quality === "max"
                                ? "2.5 Max"
                                : a.kind}
                        {a.width > 0 && a.height > 0 ? ` · ${a.width} × ${a.height}` : ""}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="campaign-empty-state">
                <div className="empty-image-stack">
                  <Images />
                </div>
                <h2>
                  {tab === "saved"
                    ? "Collect the keepers."
                    : "A new direction starts here."}
                </h2>
                <p>
                  {tab === "saved"
                    ? "Save as many images as you like. Add from your library, upload photos, or explore ideas in chat."
                    : "Describe your idea in Creative chat, or build a scene with your RV and a landscape."}
                </p>
                <div className="button-row">
                  <Button
                    onClick={() => {
                      setPicked([]);
                      setPicker("save");
                    }}
                  >
                    <Plus />
                    Add images
                  </Button>
                  {projectAssets.length > 0 ? (
                    <Button variant="outline" onClick={() => setTab("all")}>
                      Browse {projectAssets.length} takes
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setMobilePanel("chat");
                        composer.current?.focus();
                      }}
                    >
                      <Sparkles />
                      Start an idea
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
        <aside
          className="creative-chat"
          id="campaign-chat"
          role="tabpanel"
          aria-labelledby="campaign-chat-tab"
        >
          <div className="chat-heading">
            <div className="chat-symbol">
              <Sparkles size={20} />
            </div>
            <div>
              <h2>Creative partner</h2>
              <p>Think it through. See what’s next.</p>
            </div>
            <span className="max-pill">2.5 MAX</span>
          </div>
          <div className="chat-history">
            {!data.turns.length && !sending && (
              <div className="chat-welcome">
                <p className="campaign-kicker">LET’S MAKE SOMETHING</p>
                <h3>
                  Your next image
                  <br />
                  starts with a conversation.
                </h3>
                <p>
                  Choose a photo to riff on, or describe something new. I’ll
                  help turn the idea into a precise, editable prompt.
                </p>
                <div className="chat-starters">
                  {suggested.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setText(s);
                        composer.current?.focus();
                      }}
                    >
                      {s}
                      <ArrowUp size={15} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {data.turns.map((t) => (
              <div className="chat-turn" key={t.id}>
                <div className="user-message">
                  {parseRefs(t).length > 0 && (
                    <div className="message-references">
                      {parseRefs(t).map(
                        (id, i) =>
                          byId.get(id) && (
                            <button
                              key={id}
                              onClick={() => openImage(byId.get(id)!)}
                              aria-label={
                                "Reference " +
                                (i + 1) +
                                ": " +
                                byId.get(id)!.name
                              }
                            >
                              <img
                                src={byId.get(id)!.thumbnail_url || byId.get(id)!.url}
                                alt={byId.get(id)!.name}
                              />
                              <span>{i === 0 ? "Base" : i + 1}</span>
                            </button>
                          ),
                      )}
                    </div>
                  )}
                  <p>{t.user_text}</p>
                </div>
                <div className="assistant-message">
                  <span className="assistant-label">
                    <Sparkles size={13} />
                    Studio
                  </span>
                  {t.status === "planning" ? (
                    <p className="thinking">
                      <LoaderCircle className="spinner" size={16} />
                      Developing your direction…
                    </p>
                  ) : t.status === "failed" ? (
                    <div role="alert">
                      <p>{t.error}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={sending}
                        onClick={() => retryChat(t)}
                      >
                        <RefreshCw />
                        Retry reply
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="assistant-reply">{t.reply}</p>
                      {t.prompt && (
                        <div className="direction-card">
                          <div className="direction-top">
                            <span>
                              {parseRefs(t).length
                                ? "Image variation"
                                : "New image"}
                            </span>
                            <span>Sunburst · Max</span>
                          </div>
                          <details open={!t.batch_id}>
                            <summary>
                              {t.batch_id
                                ? "View generation prompt"
                                : "Enhanced prompt"}
                            </summary>
                            <Textarea
                              aria-label={
                                "Enhanced prompt for " +
                                t.user_text.slice(0, 40)
                              }
                              value={
                                t.batch_id
                                  ? t.prompt
                                  : (promptEdits[t.id] ?? t.prompt)
                              }
                              maxLength={12000}
                              readOnly={!!t.batch_id}
                              onChange={(e) =>
                                setPromptEdits((v) => ({
                                  ...v,
                                  [t.id]: e.target.value,
                                }))
                              }
                            />
                          </details>
                          {!t.batch_id && (
                            <>
                              <Aspect
                                value={aspects[t.id] ?? t.aspect}
                                onChange={(v) =>
                                  setAspects((s) => ({ ...s, [t.id]: v }))
                                }
                              />
                              <label className="field-label" htmlFor={"image-count-"+t.id}>Number of images</label>
                              <select id={"image-count-"+t.id} className="image-count-select" value={counts[t.id] ?? 2} disabled={!!generating} onChange={e=>setCounts(s=>({...s,[t.id]:Number(e.target.value)}))}>
                                {[1,2,3,4].map(n=><option key={n} value={n}>{n} image{n===1?"":"s"}</option>)}
                              </select>
                              <Button
                                className="generate-direction"
                                onClick={() => generate(t)}
                                disabled={
                                  !!generating ||
                                  busyJobs.length + (counts[t.id] ?? 2) > 8 ||
                                  (promptEdits[t.id] ?? t.prompt).trim()
                                    .length < 10
                                }
                              >
                                {generating === t.id ? (
                                  <LoaderCircle className="spinner" />
                                ) : (
                                  <Sparkles />
                                )}
                                Generate {counts[t.id] ?? 2} image{(counts[t.id] ?? 2) === 1 ? "" : "s"}
                                <ArrowUp />
                              </Button>
                              <small>
                                {generationSizeLabel(aspects[t.id] ?? t.aspect)}
                                . {counts[t.id] ?? 2} Max images via fal. Higher resolution
                                takes longer and may cost more.
                              </small>
                            </>
                          )}
                          {turnResults(t)}
                        </div>
                      )}
                      <div className="followup-suggestions">
                        {(JSON.parse(t.suggestions_json) as string[]).map(
                          (s) => (
                            <button
                              key={s}
                              onClick={() => {
                                setText(s);
                                setRefs(parseRefs(t));
                                composer.current?.focus();
                              }}
                            >
                              {s}
                            </button>
                          ),
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="chat-sending" role="status">
                <LoaderCircle className="spinner" size={16} />
                Reading your references and shaping the prompt…
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <div className="chat-composer-wrap">
            {(modelPacks.some((pack) => pack.status === "active") ||
              refs.length > 1) && (
              <div className="model-pack-control">
                <Select
                  value={project.model_pack_id || "none"}
                  onValueChange={applyModelPack}
                >
                  <SelectTrigger
                    className="model-pack-select"
                    aria-label="Campaign model pack"
                  >
                    <SelectValue placeholder="Choose a model pack" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No model pack</SelectItem>
                    {modelPacks
                      .filter((pack) => pack.status === "active")
                      .map((pack) => (
                        <SelectItem key={pack.id} value={pack.id}>
                          {pack.name} · {pack.assets.length} images
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {refs.length > 1 && !project.model_pack_id && (
                  <Button
                    className="model-pack-save"
                    variant="ghost"
                    size="sm"
                    disabled={savingPack}
                    onClick={saveReferencesAsPack}
                  >
                    {savingPack ? (
                      <LoaderCircle className="spinner" />
                    ) : (
                      <Bookmark />
                    )}
                    Save as model pack
                  </Button>
                )}
                {project.model_pack_id && (
                  <Button
                    className="model-pack-save"
                    variant="ghost"
                    size="sm"
                    onClick={() => applyModelPack(project.model_pack_id!)}
                  >
                    <ImagePlus />
                    Use pack references
                  </Button>
                )}
              </div>
            )}
            {refs.length > 0 && (
              <div className="composer-references">
                {refs.map((id, i) => {
                  const a = byId.get(id);
                  return a ? (
                    <div key={id}>
                      <img src={a.thumbnail_url || a.url} alt={a.name} />
                      <span>
                        {i === 0 ? "Base image" : "Reference " + (i + 1)}
                      </span>
                      <button
                        aria-label={"Remove reference " + a.name}
                        onClick={() =>
                          setRefs((v) => v.filter((x) => x !== id))
                        }
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : null;
                })}
              </div>
            )}
            <div className="chat-composer">
              <Textarea
                ref={composer}
                aria-label="Message your creative partner"
                disabled={loading}
                placeholder={
                  refs.length
                    ? "What would you change?"
                    : "Describe a new image, or ask for ideas…"
                }
                value={text}
                maxLength={6000}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <div className="composer-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPicker("refs");
                    setPicked(refs);
                    setPickerQuery("");
                  }}
                >
                  <ImagePlus />
                  Attach
                </Button>
                {refs.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setRefs([])}>
                    New image
                  </Button>
                ) : (
                  <span>New image</span>
                )}
                <Button
                  size="icon"
                  aria-label="Send message"
                  disabled={
                    sending ||
                    loading ||
                    !text.trim() ||
                    data.turns.some((t) => t.status === "planning")
                  }
                  onClick={send}
                >
                  <ArrowUp />
                </Button>
              </div>
            </div>
            <p className="composer-hint">
              Chat first. Generate when the direction feels right.
            </p>
          </div>
        </aside>
      </div>
      <Dialog open={!!picker} onOpenChange={(v) => !v && setPicker(null)}>
        <DialogContent className="campaign-picker">
          <DialogHeader>
            <DialogTitle>
              {picker === "refs"
                ? "Choose your references"
                : "Add images to this campaign"}
            </DialogTitle>
            <DialogDescription>
              {picker === "refs"
                ? "Choose up to four images. The first is the base to edit; the others guide the result."
                : "Choose several images from your library and earlier takes, or upload new photos."}
            </DialogDescription>
          </DialogHeader>
          <div className="picker-toolbar">
            <Input
              aria-label="Find images"
              placeholder="Search images…"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
            />
            {picker === "save" && (
              <label className="upload-campaign">
                <Upload size={16} />
                {uploadProgress || "Upload photos"}
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Upload campaign photos"
                  disabled={!!uploadProgress}
                  onChange={(e) => upload(e.target.files)}
                />
              </label>
            )}
          </div>
          <div className="picker-grid">
            {assets
              .filter((a) =>
                [a.name, a.brand, a.model, a.kind]
                  .join(" ")
                  .toLowerCase()
                  .includes(pickerQuery.toLowerCase()),
              )
              .map((a) => (
                <button
                  key={a.id}
                  className={picked.includes(a.id) ? "picked" : ""}
                  aria-label={"Choose " + a.name}
                  aria-pressed={picked.includes(a.id)}
                  onClick={() =>
                    setPicked((v) =>
                      v.includes(a.id)
                        ? v.filter((id) => id !== a.id)
                        : v.length >= (picker === "refs" ? 4 : 100)
                          ? v
                          : [...v, a.id],
                    )
                  }
                >
                  <img src={a.thumbnail_url || a.url} alt={a.name} loading="lazy" />
                  <span>{a.name}</span>
                  {picked.includes(a.id) && (
                    <b>
                      {picker === "refs" ? (
                        picked.indexOf(a.id) + 1
                      ) : (
                        <Check size={13} />
                      )}
                    </b>
                  )}
                </button>
              ))}
          </div>
          <div className="picker-footer">
            <span>{picked.length} selected</span>
            <Button
              disabled={!picked.length || saving || !!uploadProgress}
              onClick={async () => {
                if (picker === "refs") {
                  riff(picked);
                  setPicker(null);
                } else {
                  if (await save(picked)) setPicker(null);
                }
              }}
            >
              {picker === "refs" ? "Use references" : "Add to campaign"}
              <Check />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!inspect} onOpenChange={(v) => !v && setInspect(null)}>
        <DialogContent className="campaign-inspector">
          <DialogHeader>
            <DialogTitle>{inspect?.name}</DialogTitle>
            <DialogDescription>
              {inspect?.source === "ai-sample"
                ? "AI sample reference."
                : inspect?.parent_id
                  ? "A separate version. The source image is preserved."
                  : "Inspect this image before exporting."}
            </DialogDescription>
          </DialogHeader>
          {inspect && (
            <>
              <PhotoSource asset={inspect} />
              <div className="inspector-toolbar">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActual(!actual)}
                >
                  {actual ? "Fit image" : "Actual size"}
                </Button>
                {(byId.get(inspect.parent_id ?? "") ||
                  byId.get(project.rv_id ?? "")) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCompare(!compare)}
                  >
                    {compare ? "Single image" : "Compare source"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    riff([inspect.id]);
                    setText(realismRefinement);
                    setInspect(null);
                  }}
                >
                  <Sparkles />
                  Make more lifelike
                </Button>
                <span>
                  {inspect.width || "Original"}
                  {inspect.height ? " × " + inspect.height : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    riff([inspect.id]);
                    setInspect(null);
                  }}
                >
                  <Sparkles />
                  Riff on this
                </Button>
              </div>
              <div
                className={
                  "campaign-inspector-images " + (compare ? "compare" : "")
                }
              >
                <div>
                  {inspect.photo_source ? <OriginalPhoto key={inspect.id} src={inspect.url} alt={inspect.name} className={actual ? "actual" : ""} /> : <img src={inspect.url} alt={inspect.name} className={actual ? "actual" : ""} />}
                </div>
                {compare && (
                  <div>
                    <p>Source reference</p>
                    <img
                      src={
                        (
                          byId.get(inspect.parent_id ?? "") ||
                          byId.get(project.rv_id ?? "")
                        )?.url
                      }
                      alt="Source reference"
                    />
                  </div>
                )}
              </div>
              <div className="inspector-footer">
                {!savedSet.has(inspect.id) ? (
                  <Button onClick={() => save([inspect.id])} disabled={saving}>
                    <Bookmark />
                    Save to campaign
                  </Button>
                ) : inspect.approved ? (
                  <>
                    <span className="approved-label">
                      <Check />
                      Approved
                    </span>
                    <Button asChild>
                      <a href={inspect.url + "?download=1"} download>
                        <Download />
                        Download master
                      </a>
                    </Button>
                  </>
                ) : ["composition", "lifestyle", "campaign"].includes(
                    inspect.kind,
                  ) ? (
                  <>
                    <div className="campaign-review-checks">
                      {(["rv", "scene", "crop"] as const).map((key, i) => (
                        <label key={key}>
                          <Checkbox
                            checked={checks[key]}
                            onCheckedChange={(v) =>
                              setChecks((c) => ({ ...c, [key]: v === true }))
                            }
                          />
                          {
                            [
                              "RV details checked",
                              "Scene checked",
                              "Framing checked",
                            ][i]
                          }
                        </label>
                      ))}
                    </div>
                    <Button
                      disabled={
                        saving || !checks.rv || !checks.scene || !checks.crop
                      }
                      onClick={approveImage}
                    >
                      <Check />
                      Approve for export
                    </Button>
                  </>
                ) : (
                  <span>
                    <Bookmark size={14} />
                    Saved to campaign
                  </span>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
