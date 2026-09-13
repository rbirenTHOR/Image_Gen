"use client";
import { OriginalPhoto } from "@/components/original-photo";
import { PhotoSource } from "@/components/photo-source";
import CampaignWorkspace, {
  CampaignHome,
} from "@/components/campaign-workspace";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Mountain,
  ArrowRight,
  ArrowLeft,
  Plus,
  Check,
  Sun,
  Scan,
  Upload,
  Search,
  Sparkles,
  Expand,
  RefreshCw,
  Download,
  History,
  ImagePlus,
  LoaderCircle,
  FolderOpen,
  Settings2,
  Save,
  LockKeyhole,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Toaster, toast } from "sonner";
import {
  activeStatus,
  generationSizeLabel,
  stages,
  type Asset,
  type Project,
  type Batch,
  type Stage,
  type GenerationStage,
} from "@/lib/domain";
const BASE = "/api/studio/";
async function api<T>(
  path: string,
  data?: unknown,
  method?: string,
): Promise<T> {
  const r = await fetch(BASE + path, {
    method: method ?? (data === undefined ? "GET" : "POST"),
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = (await r.json()) as T & { error?: string };
  if (!r.ok)
    throw new Error(
      r.status === 401
        ? "SIGN_IN"
        : result.error || "This action did not complete.",
    );
  return result;
}
const stageLabels = [
  "Your RV",
  "The setting",
  "The photograph",
  "A little life",
  "Review & export",
];
const stageHints = [
  "Choose your reference",
  "Find your backdrop",
  "Compose & choose",
  "People & objects",
  "Make it yours",
];
const defaults: Record<GenerationStage, string> = {
  campaign: "Create a fresh RV campaign photograph.",
  variation: "Refine this campaign image.",
  landscape:
    "A quiet alpine lakeshore photographed from standing height. A usable gravel clearing has uneven small stones and sparse local grass; irregular pines frame the middle distance. Mountain ridges soften naturally with distance. Neutral late-afternoon daylight with gentle warmth, a modest sky and calm water. No people or vehicles.",
  compose:
    "Place the selected RV naturally on the open foreground. Preserve its shape, windows, wheels and graphics. Match the landscape light, perspective and contact shadows. No people or props.",
  people:
    "A relaxed family sharing a quiet moment beside the RV. Candid body language, natural outdoor clothing and realistic skin. Preserve the RV and landscape.",
  objects:
    "Add two folding camping chairs and a small table beside the RV. Keep the placement natural and match the scene’s light, scale and shadows.",
  prop: "A khaki folding camping chair with realistic fabric and metal legs, photographed clearly against a simple neutral background.",
};
const scenePresets = [
  ["Alpine lake", defaults.landscape],
  [
    "Desert light",
    "A broad Death Valley-inspired desert clearing with geographically plausible mountains, restrained early morning light and generous level foreground. No vehicles, people or human-made objects.",
  ],
  [
    "Coastal calm",
    "A wide coastal landscape overlooking the Pacific, natural grasses and a level gravel foreground. Soft morning light, subtle ocean haze. No buildings, people or vehicles.",
  ],
  [
    "Forest retreat",
    "An open clearing in a pine forest, distant trees and usable level foreground, soft daylight through a broken canopy, irregular branch structures and distinct bark, needles and forest-floor textures. No tents, vehicles, people or human-made objects.",
  ],
];
function Choice({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, t]) => (
          <SelectItem key={v} value={v}>
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
export default function Studio() {
  const [assets, setAssets] = useState<Asset[]>([]),
    [projects, setProjects] = useState<Project[]>([]),
    [projectId, setProjectId] = useState(""),
    [batches, setBatches] = useState<Batch[]>([]),
    [view, setView] = useState("create"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [signIn, setSignIn] = useState(false),
    [busy, setBusy] = useState(false),
    [connected, setConnected] = useState({ fal: false, openai: false });
  const [candidate, setCandidate] = useState<string | null>(null),
    [tab, setTab] = useState("library"),
    [libraryKind, setLibraryKind] = useState("rv"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [landscapeSource, setLandscapeSource] = useState("photos"),
    [groundFilter, setGroundFilter] = useState("all"),
    [generation, setGeneration] = useState<GenerationStage>("people"),
    [aspect, setAspect] = useState("landscape_4_3"),
    [briefs, setBriefs] = useState(defaults),
    [enhanced, setEnhanced] = useState<
      Partial<Record<GenerationStage, string>>
    >({}),
    [enhancing, setEnhancing] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [reference, setReference] = useState("none"),
    [adults, setAdults] = useState(2),
    [children, setChildren] = useState(1),
    [now, setNow] = useState(Date.now());
  const [uploadOpen, setUploadOpen] = useState(false),
    [uploadKind, setUploadKind] = useState("rv"),
    [uploadProgress, setUploadProgress] = useState<number | null>(null),
    [zoom, setZoom] = useState<Asset | null>(null),
    [zoomActual, setZoomActual] = useState(false),
    [compare, setCompare] = useState(false),
    [briefOpen, setBriefOpen] = useState(false),
    [campaignDialog, setCampaignDialog] = useState(false),
    [campaignName, setCampaignName] = useState(""),
    [saveAsset, setSaveAsset] = useState<Asset | null>(null),
    [saveName, setSaveName] = useState(""),
    [checks, setChecks] = useState({ rv: false, scene: false, crop: false }),
    [crop, setCrop] = useState("original"),
    [cropX, setCropX] = useState(50),
    [cropY, setCropY] = useState(50);
  const [previewFailures, setPreviewFailures] = useState<
      Record<string, boolean>
    >({}),
    [previewRevision, setPreviewRevision] = useState<Record<string, number>>(
      {},
    ),
    [previewLoaded, setPreviewLoaded] = useState<Record<string, boolean>>({});
  const stateRef = useRef({ assets, projects, projectId });
  stateRef.current = { assets, projects, projectId };
  const project = projects.find((p) => p.id === projectId),
    stage = project?.step ?? "rv",
    stageIndex = stages.indexOf(stage),
    byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]),
    rv = byId.get(project?.rv_id ?? ""),
    landscape = byId.get(project?.landscape_id ?? ""),
    current = byId.get(project?.current_id ?? "");
  const genStage: GenerationStage =
    view === "library"
      ? libraryKind === "prop"
        ? "prop"
        : "landscape"
      : stage === "landscape"
        ? "landscape"
        : stage === "compose"
          ? "compose"
          : generation;
  const latest = batches.find((b) => b.stage === genStage),
    activeCount = batches
      .flatMap((b) => b.jobs)
      .filter((j) => activeStatus(j.status)).length;
  const refresh = useCallback(async () => {
    const data = await api<{
      assets: Asset[];
      projects: Project[];
      connections: { fal: boolean; openai: boolean };
    }>("state");
    setAssets(data.assets);
    setProjects(data.projects);
    setConnected(data.connections);
    return data;
  }, []);
  const fail = useCallback((e: unknown) => {
    const message = e instanceof Error ? e.message : "Something went wrong.";
    if (message === "SIGN_IN") setSignIn(true);
    else toast.error(message);
  }, []);
  useEffect(() => {
    api<{
      assets: Asset[];
      projects: Project[];
      connections: { fal: boolean; openai: boolean };
    }>("bootstrap", {})
      .then((data) => {
        setAssets(data.assets);
        setProjects(data.projects);
        setConnected(data.connections);
        const wanted = new URLSearchParams(location.search).get("project");
        setProjectId(
          data.projects.find((p) => p.id === wanted)?.id ??
            data.projects[0]?.id ??
            "",
        );
        const params = new URLSearchParams(location.search);
        const wantedView = params.get("view") ?? "create";
        if (["create", "library", "campaigns", "campaign"].includes(wantedView))
          setView(wantedView);
        const wantedKind = params.get("kind");
        if (
          wantedKind &&
          ["rv", "landscape", "prop", "approved"].includes(wantedKind)
        )
          setLibraryKind(wantedKind);
      })
      .catch((e) => {
        if (e.message === "SIGN_IN") setSignIn(true);
        else setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setBatches([]);
    api<Batch[]>("projects/" + projectId + "/batches")
      .then((data) => {
        if (!cancelled) setBatches(data);
      })
      .catch((e) => {
        if (!cancelled) fail(e);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, fail]);
  useEffect(() => {
    if (loading || !projectId) return;
    const url = new URL(location.href);
    url.searchParams.set("project", projectId);
    if (view === "create") url.searchParams.delete("view");
    else url.searchParams.set("view", view);
    if (view === "library") url.searchParams.set("kind", libraryKind);
    else url.searchParams.delete("kind");
    history.replaceState(null, "", url);
  }, [loading, projectId, view, libraryKind]);
  useEffect(() => {
    const restore = (event: PopStateEvent) => {
      const params = new URLSearchParams(location.search);
      const id = params.get("project");
      if (
        location.pathname === "/" &&
        stateRef.current.projects.some((p) => p.id === id)
      ) {
        // These entries change studio state only. Avoid a second framework navigation
        // that can abort and remount the app during rapid Back/Forward clicks.
        event.stopImmediatePropagation();
        setProjectId(id!);
      }
      const next = params.get("view") ?? "create";
      setView(
        ["create", "library", "campaigns", "campaign"].includes(next)
          ? next
          : "create",
      );
      const kind = params.get("kind");
      if (kind && ["rv", "landscape", "prop", "approved"].includes(kind))
        setLibraryKind(kind);
    };
    window.addEventListener("popstate", restore, { capture: true });
    return () =>
      window.removeEventListener("popstate", restore, { capture: true });
  }, []);
  useEffect(() => {
    setCandidate(
      stage === "rv"
        ? (project?.rv_id ?? null)
        : stage === "landscape"
          ? (project?.landscape_id ?? null)
          : stage === "compose"
            ? (project?.composition_id ?? null)
            : (project?.current_id ?? null),
    );
    setTab("library");
    setQuery("");
    setFilter("all");
    setChecks({ rv: false, scene: false, crop: false });
  }, [
    stage,
    projectId,
    project?.rv_id,
    project?.landscape_id,
    project?.current_id,
    project?.composition_id,
  ]);
  useEffect(() => {
    if (!batches.some((b) => b.jobs.some((j) => activeStatus(j.status))))
      return;
    let cancelled = false;
    const timer = setInterval(async () => {
      setNow(Date.now());
      try {
        const working = batches.filter((b) =>
          b.jobs.some((j) => activeStatus(j.status)),
        );
        const results = await Promise.all(
          working.map((b) => api<Batch>("batches/" + b.id)),
        );
        if (cancelled) return;
        setBatches((old) =>
          old.map((b) => results.find((r) => r.id === b.id) ?? b),
        );
        if (results.some((b) => b.jobs.some((j) => j.status === "ready")))
          await refresh();
        setError("");
      } catch {
        if (!cancelled)
          setError(
            "Connection interrupted. Your image requests are saved and will reconnect.",
          );
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [batches, refresh]);
  const replaceProject = (p: Project) =>
    setProjects((old) => old.map((x) => (x.id === p.id ? p : x)));
  function prerequisite(next: Stage) {
    if (next !== "rv" && !project?.rv_id) return "Choose an RV first";
    if (
      ["compose", "lifestyle", "review"].includes(next) &&
      !project?.landscape_id
    )
      return "Choose a setting first";
    if (["lifestyle", "review"].includes(next) && !project?.composition_id)
      return "Choose a photograph first";
    return "";
  }
  async function changeStage(next: Stage) {
    if (!project) return;
    try {
      const p = await api<Project>(
        "projects/" + project.id,
        { step: next },
        "PATCH",
      );
      replaceProject(p);
      setView("create");
    } catch (e) {
      fail(e);
    }
  }
  async function selectImage(
    assetId: string,
    selection: Exclude<Stage, "review">,
  ) {
    if (!project) return;
    setBusy(true);
    try {
      const p = await api<Project>("projects/" + project.id + "/select", {
        stage: selection,
        asset_id: assetId,
      });
      replaceProject(p);
      await refresh();
      toast.success(
        selection === "rv"
          ? "RV selected"
          : selection === "landscape"
            ? "Landscape selected"
            : "Take selected",
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function enhance() {
    setEnhancing(true);
    try {
      const v = await api<{ prompt: string }>("enhance", {
        stage: genStage,
        brief: briefs[genStage],
      });
      setEnhanced((old) => ({ ...old, [genStage]: v.prompt }));
      toast.success("Enhanced prompt ready to review");
    } catch (e) {
      fail(e);
    } finally {
      setEnhancing(false);
    }
  }
  async function generate() {
    if (!project) return;
    const id = crypto.randomUUID();
    const prompt =
      (enhanced[genStage] || briefs[genStage]) +
      (genStage === "people"
        ? `\nPeople: exactly ${adults} adults and ${children} children.`
        : "");
    const payload = {
      id,
      project_id: project.id,
      stage: genStage,
      prompt,
      aspect,
      ...(reference !== "none" && genStage === "objects"
        ? { reference_id: reference }
        : {}),
    };
    const placeholder: Batch = {
      id,
      project_id: project.id,
      stage: genStage,
      prompt,
      endpoint:
        genStage === "people"
          ? "meta/muse-image/edit"
          : "openai/gpt-image-2.5/sunburst/" +
            (["landscape", "prop"].includes(genStage)
              ? "text-to-image"
              : "edit"),
      quality: genStage === "people" ? "native" : "max",
      created_at: Date.now(),
      inputs_json: "[]",
      jobs: [0, 1, 2, 3].map((slot) => ({
        id: id + "-" + slot,
        batch_id: id,
        slot,
        status: "submitting",
        result_asset_id: null,
        error: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        request_id: null,
        elapsed_ms: null,
      })),
    };
    setBatches((old) => [placeholder, ...old]);
    setSubmitting(true);
    setCandidate(null);
    try {
      const result = await api<Batch>("batches", payload);
      setBatches((old) => old.map((b) => (b.id === id ? result : b)));
      toast.success("Four image requests submitted");
    } catch (e) {
      try {
        const existing = await api<Batch>("batches/" + id);
        setBatches((old) => old.map((b) => (b.id === id ? existing : b)));
        toast.message("Your batch was recovered.");
      } catch {
        setBatches((old) => old.filter((b) => b.id !== id));
        fail(e);
      }
    } finally {
      setSubmitting(false);
    }
  }
  async function retry(id: string) {
    try {
      const b = await api<Batch>("jobs/" + id + "/retry", {});
      setBatches((old) => old.map((x) => (x.id === b.id ? b : x)));
      await refresh();
    } catch (e) {
      fail(e);
    }
  }
  async function createCampaign() {
    if (!campaignName.trim()) return;
    setBusy(true);
    try {
      const p = await api<Project>("projects", { name: campaignName });
      setProjects((old) => [p, ...old]);
      setProjectId(p.id);
      setView("create");
      setCampaignDialog(false);
      setCampaignName("");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  function openUpload(kind: string) {
    setUploadKind(kind);
    setUploadOpen(true);
  }
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("kind", uploadKind);
    const file = form.get("file") as File;
    if (!file?.size) return toast.error("Choose an image first.");
    if (file.size > 12 * 1024 * 1024)
      return toast.error("Choose an image smaller than 12 MB.");
    setUploadProgress(0);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", BASE + "assets");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = async () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) throw new Error(data.error);
        await refresh();
        setUploadOpen(false);
        toast.success("Image added to your library");
        if (view === "create") setCandidate(data.id);
      } catch (e) {
        fail(e);
      } finally {
        setUploadProgress(null);
      }
    };
    xhr.onerror = () => {
      setUploadProgress(null);
      toast.error("Upload interrupted. Your original file is unchanged.");
    };
    xhr.send(form);
  }
  async function saveCampaign(ids: string[]) {
    if (!project) return;
    try {
      await api("projects/" + project.id + "/gallery", {
        asset_ids: ids,
        saved: true,
      });
      await refresh();
      toast.success(`${ids.length} images saved to campaign`);
    } catch (e) {
      fail(e);
    }
  }
  async function saveToLibrary() {
    if (!saveAsset) return;
    try {
      await api(
        "assets/" + saveAsset.id,
        { name: saveName, in_library: true },
        "PATCH",
      );
      await refresh();
      setSaveAsset(null);
      toast.success("Saved to your library");
    } catch (e) {
      fail(e);
    }
  }
  async function approve() {
    if (!current || !project) return;
    setBusy(true);
    try {
      await api("approve", {
        project_id: project.id,
        asset_id: current.id,
        checks,
      });
      await refresh();
      toast.success("Approved and saved. Ready to export.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!current?.approved) return;
    if (crop === "original") {
      const a = document.createElement("a");
      a.href = current.url + "?download=1";
      a.download = "";
      a.click();
      return;
    }
    setBusy(true);
    try {
      const image = new Image();
      image.src = current.url;
      await image.decode();
      const [w, h] = crop.split(":").map(Number),
        ratio = w / h;
      let sw = image.naturalWidth,
        sh = image.naturalHeight;
      if (sw / sh > ratio) sw = sh * ratio;
      else sh = sw / ratio;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sw);
      canvas.height = Math.round(sh);
      canvas
        .getContext("2d")!
        .drawImage(
          image,
          ((image.naturalWidth - sw) * cropX) / 100,
          ((image.naturalHeight - sh) * cropY) / 100,
          sw,
          sh,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Export failed"))),
          "image/jpeg",
          0.95,
        ),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        current.name.replace(/[^a-z0-9_-]/gi, "_") +
        "-" +
        crop.replace(":", "x") +
        ".jpg";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const ctx = (
      document as unknown as {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => Promise<void>;
        };
      }
    ).modelContext;
    if (!ctx) return;
    const controller = new AbortController();
    const register = (tool: unknown) => {
      try {
        Promise.resolve(
          ctx.registerTool(tool, { signal: controller.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: "list_rv_studio_assets",
      title: "List studio assets",
      description: "Read available RVs, landscapes, props and approved images.",
      inputSchema: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["rv", "landscape", "prop", "approved"],
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input: unknown) => {
        const v = input as { kind?: string };
        if (v.kind && !["rv", "landscape", "prop", "approved"].includes(v.kind))
          throw new Error("Invalid asset kind");
        return stateRef.current.assets
          .filter(
            (a) =>
              !v.kind ||
              (v.kind === "approved"
                ? a.approved
                : a.kind === v.kind && a.in_library),
          )
          .map((a) => ({
            id: a.id,
            name: a.name,
            kind: a.kind,
            approved: !!a.approved,
          }));
      },
    });
    register({
      name: "open_rv_studio_campaign",
      title: "Open campaign",
      description:
        "Navigate to an existing campaign. Does not generate or approve images.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        const id = (input as { id?: unknown }).id;
        if (
          typeof id !== "string" ||
          !stateRef.current.projects.some((p) => p.id === id)
        )
          throw new Error("Campaign not found");
        setProjectId(id);
        setView("create");
        return { opened: id };
      },
    });
    return () => controller.abort();
  }, []);
  function assetCard(a: Asset, selectable = true) {
    return (
      <article
        className={"asset-card " + (candidate === a.id ? "chosen" : "")}
        key={a.id}
      >
        <button
          className="asset-photo"
          onClick={() => {
            if (previewFailures[a.id]) {
              setPreviewFailures((v) => ({ ...v, [a.id]: false }));
              setPreviewLoaded((v) => ({ ...v, [a.id]: false }));
              setPreviewRevision((v) => ({ ...v, [a.id]: (v[a.id] ?? 0) + 1 }));
            } else if (selectable) setCandidate(a.id);
            else setZoom(a);
          }}
          aria-label={
            (previewFailures[a.id]
              ? "Retry preview "
              : selectable
                ? "Select "
                : "View ") + a.name
          }
          aria-pressed={selectable ? candidate === a.id : undefined}
        >
          <img
            src={
              (a.thumbnail_url || a.url) +
              (previewRevision[a.id] ? "?preview=" + previewRevision[a.id] : "")
            }
            alt={a.name}
            loading="lazy"
            onLoad={() => setPreviewLoaded((v) => ({ ...v, [a.id]: true }))}
            onError={() => setPreviewFailures((v) => ({ ...v, [a.id]: true }))}
          />
          {!previewLoaded[a.id] && (
            <span className="preview-status">
              {previewFailures[a.id] ? (
                <>
                  <RefreshCw size={24} />
                  Image preview interrupted · click to retry
                </>
              ) : (
                <>
                  <LoaderCircle className="spinner" />
                  Loading image…
                </>
              )}
            </span>
          )}
          {candidate === a.id && selectable && (
            <span className="selected-mark">
              <Check size={16} />
            </span>
          )}
          <span className="asset-caption">
            <strong>{a.name}</strong>
            <small>
              {[a.brand, a.model, a.year, a.environment, a.lighting]
                .filter(Boolean)
                .join(" / ") || a.kind}
            </small>
          </span>
        </button>
        {a.photo_source && <div className="photo-card-detail"><span>{a.photo_source.suitability === "placement" ? "Open ground" : "Scenic reference"}</span><span>{a.width.toLocaleString()} × {a.height.toLocaleString()}</span><p>{a.photo_source.location}</p></div>}
        <div className="asset-actions">
          {project && (
            <Button
              variant="ghost"
              size="sm"
              disabled={a.campaign_ids?.includes(project.id)}
              onClick={() => saveCampaign([a.id])}
              aria-label={
                (a.campaign_ids?.includes(project.id)
                  ? "Saved to campaign "
                  : "Save to campaign ") + a.name
              }
            >
              {a.campaign_ids?.includes(project.id) ? <Check /> : <Save />}
              {a.campaign_ids?.includes(project.id) ? "Saved" : "Save"}
            </Button>
          )}
          <span>
            {a.source === "sourced-photo"
              ? "Real photo · 8K+"
              : a.source === "ai-sample"
              ? "AI sample"
              : a.approved
                ? "Approved"
                : a.source === "uploaded"
                  ? "Original upload"
                  : a.in_library
                    ? a.kind === "prop"
                      ? "Saved object"
                      : "Saved landscape"
                    : "Generated draft"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={"Enlarge " + a.name}
            onClick={() => {
              setZoom(a);
              setZoomActual(false);
              if (a.kind === "landscape") setCompare(false);
            }}
          >
            <Expand />
          </Button>
          {!a.in_library && ["landscape", "prop"].includes(a.kind) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSaveAsset(a);
                setSaveName(a.name);
              }}
            >
              <Save />
              Save
            </Button>
          )}
        </div>
      </article>
    );
  }
  function batchGrid(b: Batch) {
    const ready = b.jobs.filter((j) => j.status === "ready").length;
    return (
      <section className="batch-section" key={b.id}>
        <div className="batch-heading">
          <div>
            <h3>
              {b.stage === "landscape"
                ? "Your new landscapes"
                : b.stage === "prop"
                  ? "Your new objects"
                  : "Choose your favorite take"}
            </h3>
            <p>
              {b.stage === "people"
                ? "Meta Muse"
                : `GPT Image 2.5 · Sunburst · Max`}{" "}
              · via fal
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!ready}
            onClick={() =>
              saveCampaign(
                b.jobs
                  .map((j) => j.result_asset_id)
                  .filter((id): id is string => !!id),
              )
            }
          >
            <Save />
            Save all ready
          </Button>
          <span aria-live="polite">
            {ready} of 4 ready
            {b.jobs.some((j) => activeStatus(j.status))
              ? " · " + formatElapsed(now - b.created_at)
              : ""}
          </span>
        </div>
        <p className="selection-help">
          {b.stage === "compose" && b.jobs.some(j => j.shot_label) ? "Four placements planned from your RV and backdrop. " : ""}Save any photos you like to your campaign. Select one photo to
          continue editing.
        </p>
        <Progress
          value={ready * 25}
          aria-label={`${ready} of 4 images ready`}
          className="batch-progress"
        />
        <div className="results-grid">
          {b.jobs.map((j) => {
            const a = byId.get(j.result_asset_id ?? "");
            return a ? (
              j.shot_label ? <div className="planned-take" key={j.id}><p className="shot-label">Take {j.slot + 1} · {j.shot_label}</p>{assetCard(a)}</div> : assetCard(a)
            ) : (
              <article className="job-card" key={j.id}>
                <div className="job-placeholder">
                  {activeStatus(j.status) ? (
                    <>
                      <Skeleton className="job-skeleton" />
                      <LoaderCircle className="spinner" />
                    </>
                  ) : (
                    <ImagePlus />
                  )}
                  <strong>
                    {
                      (
                        {
                          submitting: b.stage === "compose" && !j.shot_label ? "Assessing photos & planning placement" : "Submitting",
                          queued: "Queued",
                          generating: "Generating",
                          saving: "Saving image",
                          failed: "Generation failed",
                          unknown: "Needs reconciliation",
                          save_failed: "Saving interrupted",
                          ready: "Loading image",
                        } as Record<string, string>
                      )[j.status]
                    }
                  </strong>
                </div>
                <div className="job-info">
                  <span>Take {j.slot + 1}{j.shot_label ? " · " + j.shot_label : ""}</span>
                  {j.error && <p>{j.error}</p>}
                  {["failed", "save_failed"].includes(j.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => retry(j.id)}
                    >
                      <RefreshCw />
                      {j.status === "save_failed"
                        ? "Retry saving"
                        : "Retry this image"}
                    </Button>
                  )}
                  {j.status === "unknown" && j.request_id && (
                    <code>{j.request_id}</code>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <details className="batch-detail">
          <summary>Generation details</summary>
          <p>
            {b.endpoint} · {b.quality} ·{" "}
            {new Date(b.created_at).toLocaleString()}
          </p>
          <p className="prompt-readback">{b.prompt}</p>
          {b.jobs.filter(j => j.shot_label).map(j => <details key={j.id} className="shot-prompt"><summary>Take {j.slot + 1} · {j.shot_label}</summary><p className="prompt-readback">{j.generation_prompt}</p></details>)}
          <p>
            Provider request IDs:{" "}
            {b.jobs.map((j) => j.request_id || "Awaiting receipt").join(", ")}
          </p>
        </details>
      </section>
    );
  }
  function generator() {
    return (
      <>
        <section className="form-panel generator">
          <div className="form-title">
            <div>
              <p className="eyebrow">
                {genStage === "landscape"
                  ? "A PLACE WORTH GOING"
                  : genStage === "prop"
                    ? "YOUR OBJECT REFERENCE"
                    : "DIRECT THE SHOT"}
              </p>
              <h2>
                {genStage === "landscape"
                  ? "Describe your setting."
                  : genStage === "prop"
                    ? "Create a reusable object."
                    : genStage === "compose"
                      ? "Bring the scene together."
                      : "Make the moment feel real."}
              </h2>
            </div>
            <span className="model-badge">
              {genStage === "people" ? "Meta Muse" : "Sunburst · Max"}
              <small>via fal</small>
            </span>
          </div>
          {genStage === "landscape" && (
            <div className="preset-row">
              {scenePresets.map(([name, text]) => (
                <Button
                  key={name}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBriefs((s) => ({ ...s, landscape: text }));
                    setEnhanced((s) => ({ ...s, landscape: undefined }));
                  }}
                >
                  {name}
                </Button>
              ))}
            </div>
          )}
          {genStage === "people" && (
            <div className="field-grid">
              <label>
                Adults
                <Input
                  type="number"
                  min="0"
                  max="8"
                  value={adults}
                  onChange={(e) =>
                    setAdults(Math.max(0, Math.min(8, Number(e.target.value))))
                  }
                />
              </label>
              <label>
                Children
                <Input
                  type="number"
                  min="0"
                  max="8"
                  value={children}
                  onChange={(e) =>
                    setChildren(
                      Math.max(0, Math.min(8, Number(e.target.value))),
                    )
                  }
                />
              </label>
            </div>
          )}
          {genStage === "objects" && (
            <label className="field-label">
              Object reference
              <Choice
                value={reference}
                onChange={setReference}
                label="Object reference"
                options={[
                  ["none", "Describe an object"],
                  ...assets
                    .filter((a) => a.kind === "prop" && a.in_library)
                    .map((a) => [a.id, a.name] as [string, string]),
                ]}
              />
            </label>
          )}
          <label className="field-label" htmlFor="creative-brief">
            Creative brief
          </label>
          <Textarea
            id="creative-brief"
            value={briefs[genStage]}
            onChange={(e) => {
              setBriefs((s) => ({ ...s, [genStage]: e.target.value }));
              setEnhanced((s) => ({ ...s, [genStage]: undefined }));
            }}
          />
          <div className="prompt-controls">
            <Button
              variant="outline"
              onClick={enhance}
              disabled={
                enhancing || !connected.openai || briefs[genStage].length < 5
              }
            >
              {enhancing ? <LoaderCircle className="spinner" /> : <Sparkles />}
              Enhance prompt
            </Button>
            <span>Review and edit the full prompt before generating.</span>
          </div>
          {enhanced[genStage] && (
            <div className="enhanced-prompt">
              <label className="field-label" htmlFor="enhanced-brief">
                Enhanced prompt · editable
              </label>
              <Textarea
                id="enhanced-brief"
                value={enhanced[genStage]}
                onChange={(e) =>
                  setEnhanced((s) => ({ ...s, [genStage]: e.target.value }))
                }
              />
            </div>
          )}
          <div className="generate-footer">
            <div>
              <Choice
                value={aspect}
                onChange={setAspect}
                label="Image aspect ratio"
                options={[
                  ["landscape_4_3", "Landscape · 4:3"],
                  ["landscape_16_9", "Wide · 16:9"],
                  ["square_hd", "Square · 1:1"],
                  ["portrait_4_3", "Portrait · 3:4"],
                ]}
              />
              <small>
                {genStage === "people"
                  ? "Four images billed by fal."
                  : `${generationSizeLabel(aspect)}. Four Max images via fal.`}{" "}
                Higher resolution takes longer and may cost more.
              </small>
            </div>
            <Button
              onClick={generate}
              disabled={
                submitting ||
                !connected.fal ||
                (enhanced[genStage] || briefs[genStage]).length < 10 ||
                activeCount >= 8
              }
            >
              {submitting ? <LoaderCircle className="spinner" /> : <Sparkles />}
              {genStage === "landscape"
                ? "Create 4 landscapes"
                : genStage === "prop"
                  ? "Create 4 objects"
                  : "Generate 4 takes"}
            </Button>
          </div>
        </section>
        {latest && batchGrid(latest)}
        {batches.filter((b) => b.stage === genStage && b.id !== latest?.id)
          .length > 0 && (
          <details className="earlier">
            <summary>
              <History size={16} />
              Earlier takes
            </summary>
            {batches
              .filter((b) => b.stage === genStage && b.id !== latest?.id)
              .map(batchGrid)}
          </details>
        )}
      </>
    );
  }
  const libKind =
    view === "library" ? libraryKind : stage === "rv" ? "rv" : "landscape";
  const filterValues = [
    ...new Set(
      assets
        .filter((a) => a.kind === libKind && a.in_library && (libKind !== "landscape" || landscapeSource === "all" || (landscapeSource === "photos" ? a.source === "sourced-photo" : a.source !== "sourced-photo")))
        .map((a) => (libKind === "rv" ? a.brand : a.environment))
        .filter(Boolean),
    ),
  ];
  const libraryAssets = assets.filter(
    (a) =>
      (libKind === "approved"
        ? a.approved
        : a.kind === libKind && a.in_library) &&
      (libKind !== "landscape" || landscapeSource === "all" || (landscapeSource === "photos" ? a.source === "sourced-photo" : a.source !== "sourced-photo")) &&
      (libKind !== "landscape" || groundFilter === "all" || a.photo_source?.suitability === groundFilter) &&
      (!query ||
        [a.name, a.brand, a.model, a.year, a.environment, a.angle, a.photo_source?.location, a.photo_source?.photographer]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (filter === "all" ||
        (libKind === "rv" ? a.brand : a.environment) === filter),
  );
  function library() {
    return (
      <>
        {libKind === "landscape" && <div className="backdrop-intro">
          <div><p>{landscapeSource === "photos" ? "Original nature photography, ready to use. Choose a setting with room for your RV." : "Reuse your uploaded and generated landscapes."}</p></div>
          <Choice value={landscapeSource} onChange={(v) => { setLandscapeSource(v); setFilter("all"); setGroundFilter("all"); setQuery(""); }} label="Backdrop collection" options={[["photos", "Real photographs"], ["mine", "Saved & generated"], ["all", "All backdrops"]]} />
        </div>}
        <div className="library-toolbar">
          <div className="search-field">
            <Search size={18} />
            <Input
              aria-label="Search library"
              placeholder={
                libKind === "rv"
                  ? "Search brand, model, year or angle…"
                  : libKind === "landscape" ? "Search place, scenery or photographer…" : "Search your library…"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {filterValues.length > 0 && (
            <Choice
              value={filter}
              onChange={setFilter}
              label={libKind === "rv" ? "Filter brand" : "Filter environment"}
              options={[
                ["all", libKind === "rv" ? "All brands" : "All environments"],
                ...filterValues.map((v) => [v, v] as [string, string]),
              ]}
            />
          )}
        </div>
        {libKind === "landscape" && landscapeSource !== "mine" && <div className="ground-filters" role="group" aria-label="Ground space">
          {[["all", "All scenes"], ["placement", "Open ground"], ["scenery", "Scenic references"]].map(([value, label]) => <Button key={value} variant={groundFilter === value ? "default" : "outline"} size="sm" aria-pressed={groundFilter === value} onClick={() => setGroundFilter(value)}>{label}</Button>)}
        </div>}
        {!libraryAssets.length && (query || filter !== "all" || groundFilter !== "all") && (
          <div className="empty-state" role="status">
            <Search />
            <h2>No matching images</h2>
            <p>Try another name or clear your search and filters.</p>
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setFilter("all");
                setGroundFilter("all");
              }}
            >
              Clear search
            </Button>
          </div>
        )}
        {libKind === "landscape" && <p className="backdrop-count" role="status">{libraryAssets.length} backdrops{landscapeSource === "photos" ? " · Native 8K+ originals · No generation needed" : ""}</p>}
        <div
          className={
            "library-grid " +
            (libKind === "landscape" && libraryAssets.length < 3
              ? "featured"
              : "")
          }
        >
          {libraryAssets.map((a) => assetCard(a, view === "create"))}
          {libKind !== "approved" && (
            <button className="upload-tile" onClick={() => openUpload(libKind)}>
              <Plus />
              <strong>
                {libKind === "rv"
                  ? "Add your RV"
                  : libKind === "prop"
                    ? "Add an object reference"
                    : "Add a landscape"}
              </strong>
              <span>Upload JPG, PNG or WebP</span>
            </button>
          )}
        </div>
        {libKind === "approved" && !libraryAssets.length && (
          <div className="empty-state">
            <FolderOpen />
            <h2>Your approved images will live here.</h2>
            <p>
              Select a finished photograph and complete its review to save it.
            </p>
            <Button onClick={() => setView("create")}>
              Back to your campaign
            </Button>
          </div>
        )}
      </>
    );
  }
  if (signIn)
    return (
      <div className="signin">
        <Mountain size={40} />
        <h1>THOR RV Studio</h1>
        <p>Sign in to your private image studio.</p>
        <Button asChild>
          <a href="/signin-with-chatgpt?return_to=%2F" target="_top">
            Sign in with ChatGPT
          </a>
        </Button>
      </div>
    );
  if (loading)
    return (
      <div className="loading-studio">
        <Mountain size={35} />
        <p>Opening your studio…</p>
        <Skeleton className="h-3 w-48" />
      </div>
    );
  if (error && !projects.length)
    return (
      <div className="signin">
        <Mountain />
        <h1>Your studio couldn’t load.</h1>
        <p role="alert">{error}</p>
        <Button onClick={() => location.reload()}>Try again</Button>
      </div>
    );
  function navigate(next: string) {
    setView(next);
    const url = new URL(location.href);
    if (next !== "create") url.searchParams.set("view", next);
    else url.searchParams.delete("view");
    if (next === "library") url.searchParams.set("kind", libraryKind);
    else url.searchParams.delete("kind");
    if (url.toString() !== location.href) history.pushState(null, "", url);
  }
  if (view === "campaign" && project)
    return (
      <>
        <Toaster theme="system" richColors position="top-right" />
        <CampaignWorkspace
          key={project.id}
          project={project}
          assets={assets}
          batches={batches}
          onNav={navigate}
          onRefresh={refresh}
          onBatch={(b) =>
            setBatches((old) => [b, ...old.filter((x) => x.id !== b.id)])
          }
          onWizard={() => navigate("create")}
        />
      </>
    );
  if (view === "campaigns")
    return (
      <>
        <Toaster theme="system" richColors position="top-right" />
        <CampaignHome
          projects={projects}
          assets={assets}
          onNav={navigate}
          onOpen={(id) => {
            setProjectId(id);
            navigate("campaign");
          }}
          onNew={async () => {
            try {
              const p = await api<Project>("projects", {
                name: "Untitled campaign",
              });
              setProjects((old) => [p, ...old]);
              setProjectId(p.id);
              navigate("campaign");
            } catch (e) {
              fail(e);
            }
          }}
        />
      </>
    );
  const title =
    view === "campaigns"
      ? "Your next great escape."
      : view === "library"
        ? (
            {
              rv: "Your RV library.",
              landscape: "Places worth going.",
              prop: "The finishing touches.",
              approved: "Ready for the world.",
            } as Record<string, string>
          )[libraryKind]
        : [
            "Start with the real thing.",
            "Where will you go?",
            "Your RV. A new perspective.",
            "Give the scene a little life.",
            "Look closer. Make it yours.",
          ][stageIndex];
  return (
    <div className="studio">
      <Toaster theme="system" richColors position="top-right" />
      <header className="topbar">
        <button
          className="brand"
          onClick={() => navigate("create")}
          aria-label="THOR Studio home"
        >
          <Mountain />
          THOR STUDIO
        </button>
        <nav aria-label="Main navigation">
          {["library", "create", "campaigns"].map((v) => (
            <button
              key={v}
              className={view === v ? "active" : ""}
              onClick={() => {
                navigate(v);
                setQuery("");
                setFilter("all");
                setTab("library");
              }}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </nav>
        <button
          className="avatar"
          aria-label="Open shot brief"
          onClick={() => setBriefOpen(true)}
        >
          <Settings2 size={16} />
        </button>
      </header>
      <SidebarProvider className="app-shell">
        <Sidebar collapsible="none" className="studio-sidebar">
          <SidebarContent>
            <div className="rail-content">
              <p className="eyebrow">YOUR CAMPAIGN</p>
              <button
                className="campaign-title"
                title={project?.name || "A season outside"}
                onClick={() => setBriefOpen(true)}
              >
                {project?.name || "A season outside"}
              </button>
              <div className="step-list">
                {stages.map((s, i) => (
                  <button
                    key={s}
                    className={
                      "step " +
                      (view === "create" && stage === s ? "current" : "")
                    }
                    onClick={() => changeStage(s)}
                    disabled={!!prerequisite(s)}
                    title={prerequisite(s) || stageHints[i]}
                    aria-current={
                      view === "create" && stage === s ? "step" : undefined
                    }
                  >
                    <span className="step-number">
                      {i < stageIndex ? <Check size={13} /> : i + 1}
                    </span>
                    <span>
                      <strong>{stageLabels[i]}</strong>
                      <small>{prerequisite(s) || stageHints[i]}</small>
                    </span>
                  </button>
                ))}
              </div>
              {rv && (
                <div className="source-thumb">
                  <p className="eyebrow">YOUR REFERENCE</p>
                  <button onClick={() => setZoom(rv)}>
                    <img src={rv.url} alt={rv.name} />
                  </button>
                  <strong>{rv.name}</strong>
                  <small>
                    {rv.source === "ai-sample"
                      ? "AI sample · replace with your RV"
                      : [rv.brand, rv.model, rv.year]
                          .filter(Boolean)
                          .join(" / ") || "Original reference"}
                  </small>
                </div>
              )}
              <button
                className="new-campaign-link"
                onClick={() => navigate("campaign")}
              >
                <FolderOpen size={16} />
                Campaign gallery & chat
              </button>
              <button
                className="new-campaign-link"
                onClick={() => {
                  setCampaignName("");
                  setCampaignDialog(true);
                }}
              >
                <Plus size={16} />
                New campaign
              </button>
              <div className="connection-note">
                <LockKeyhole size={13} />
                Private studio
                {activeCount > 0 && <span>{activeCount} images working</span>}
              </div>
            </div>
          </SidebarContent>
        </Sidebar>
        <main className="workspace">
          <div className="mobile-steps">
            {stages.map((s, i) => (
              <button
                key={s}
                aria-label={stageLabels[i]}
                className={stage === s ? "current" : ""}
                onClick={() => changeStage(s)}
                disabled={!!prerequisite(s)}
                title={prerequisite(s) || stageHints[i]}
                aria-current={stage === s ? "step" : undefined}
              >
                {i + 1}
                <span>{stageLabels[i]}</span>
              </button>
            ))}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <Button
                variant="ghost"
                onClick={() =>
                  refresh()
                    .then(() => setError(""))
                    .catch(fail)
                }
              >
                Reconnect
              </Button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {view === "create"
                  ? `0${stageIndex + 1} / ${stageLabels[stageIndex]}`
                  : view === "library"
                    ? "YOUR SHARED CREATIVE FOUNDATION"
                    : "YOUR CAMPAIGNS"}
              </p>
              <h1>{title}</h1>
              <p>
                {view === "campaigns"
                  ? "Pick up where you left off, or start somewhere new."
                  : view === "library"
                    ? "Keep the images you want to use again."
                    : [
                        "Choose an original RV photo, or upload a new reference.",
                        "Find a setting that feels like your next adventure.",
                        "Choose the photograph before adding people or objects.",
                        "Work on your selected take. Every accepted version is kept.",
                        "Compare with the original RV before approving your photograph.",
                      ][stageIndex]}
              </p>
            </div>
            <Button variant="outline" onClick={() => setBriefOpen(true)}>
              <Settings2 />
              Shot brief
            </Button>
          </div>
          {view === "campaigns" ? (
            <>
              <Button
                className="mb-6"
                onClick={() => {
                  setCampaignName("");
                  setCampaignDialog(true);
                }}
              >
                <Plus />
                New campaign
              </Button>
              <div className="campaign-grid">
                {projects.map((p) => (
                  <button
                    className="campaign-card"
                    key={p.id}
                    onClick={() => {
                      setProjectId(p.id);
                      setView("create");
                    }}
                  >
                    {byId.get(
                      p.current_id ?? p.landscape_id ?? p.rv_id ?? "",
                    ) ? (
                      <img
                        src={
                          byId.get(
                            p.current_id ?? p.landscape_id ?? p.rv_id ?? "",
                          )!.thumbnail_url || byId.get(p.current_id ?? p.landscape_id ?? p.rv_id ?? "")!.url
                        }
                        alt="Campaign preview"
                      />
                    ) : (
                      <div className="campaign-empty">
                        <Mountain />
                      </div>
                    )}
                    <div>
                      <h2>{p.name}</h2>
                      <p>
                        {stageLabels[stages.indexOf(p.step)]} ·{" "}
                        {new Date(p.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : view === "library" ? (
            <Tabs
              value={libraryKind}
              onValueChange={(v) => {
                setLibraryKind(v);
                setQuery("");
                setFilter("all");
                setTab("library");
              }}
            >
              <TabsList variant="line">
                <TabsTrigger
                  value="rv"
                  id="library-tab-rv"
                  aria-controls="library-panel"
                >
                  RVs
                </TabsTrigger>
                <TabsTrigger
                  value="landscape"
                  id="library-tab-landscape"
                  aria-controls="library-panel"
                >
                  Landscapes
                </TabsTrigger>
                <TabsTrigger
                  value="prop"
                  id="library-tab-prop"
                  aria-controls="library-panel"
                >
                  Objects
                </TabsTrigger>
                <TabsTrigger
                  value="approved"
                  id="library-tab-approved"
                  aria-controls="library-panel"
                >
                  Approved
                </TabsTrigger>
              </TabsList>
              <div className="library-actions">
                {["landscape", "prop"].includes(libraryKind) && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setTab(tab === "generate" ? "library" : "generate")
                    }
                  >
                    <Sparkles />
                    {tab === "generate"
                      ? "Back to library"
                      : libraryKind === "prop"
                        ? "Generate an object"
                        : "Generate landscapes"}
                  </Button>
                )}
              </div>
              <div
                id="library-panel"
                role="tabpanel"
                aria-labelledby={"library-tab-" + libraryKind}
              >
                {tab === "generate" ? generator() : library()}
              </div>
            </Tabs>
          ) : stage === "rv" ? (
            <>
              {library()}
              <footer className="workspace-footer">
                <div>
                  <small>Selected RV</small>
                  <strong>
                    {byId.get(candidate ?? "")?.name ||
                      "Choose an image to continue"}
                  </strong>
                </div>
                <Button
                  onClick={() => candidate && selectImage(candidate, "rv")}
                  disabled={!candidate || busy}
                >
                  Choose the setting
                  <ArrowRight />
                </Button>
              </footer>
            </>
          ) : stage === "landscape" ? (
            <>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList variant="line">
                  <TabsTrigger value="library">Photo library</TabsTrigger>
                  <TabsTrigger value="generate">
                    <Sparkles />
                    Generate a setting
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="library">{library()}</TabsContent>
                <TabsContent value="generate">{generator()}</TabsContent>
              </Tabs>
              <div className="chips">
                <span>
                  <Sun size={14} />
                  Natural light
                </span>
                <span>
                  <Scan size={14} />
                  Open foreground
                </span>
                <span>Originals preserved</span>
              </div>
              <footer className="workspace-footer">
                <div>
                  <small>Your selected setting</small>
                  <strong>
                    {byId.get(candidate ?? "")?.name ||
                      "Choose a landscape to continue"}
                  </strong>
                </div>
                <Button
                  disabled={
                    !candidate ||
                    busy ||
                    byId.get(candidate)?.kind !== "landscape"
                  }
                  onClick={() =>
                    candidate && selectImage(candidate, "landscape")
                  }
                >
                  Compose your photograph
                  <ArrowRight />
                </Button>
              </footer>
            </>
          ) : stage === "compose" ? (
            <>
              <div className="source-pair">
                {[rv, landscape].map(
                  (a, i) =>
                    a && (
                      <button key={a.id} onClick={() => setZoom(a)}>
                        <img src={a.thumbnail_url || a.url} alt={a.name} />
                        <div>
                          <small>
                            {i === 0 ? "Your RV" : "Your landscape"}
                          </small>
                          <strong>{a.name}</strong>
                        </div>
                        <Expand size={15} />
                      </button>
                    ),
                )}
              </div>
              {landscape?.photo_source && <div className="source-note"><strong>Real-photo backdrop</strong><p>The original {landscape.width.toLocaleString()} × {landscape.height.toLocaleString()} photo supplies your reference. Large files are JPEG-optimized at the same pixel dimensions; the original stays intact. AI compositions are new images up to 4K; inspect that the scenery and RV remain faithful.</p></div>}
              {generator()}
              <footer className="workspace-footer">
                <div>
                  <small>Selected composition</small>
                  <strong>
                    {byId.get(candidate ?? "")?.name ||
                      "Select one of your takes"}
                  </strong>
                </div>
                <Button
                  disabled={
                    !candidate ||
                    busy ||
                    byId.get(candidate)?.kind !== "composition"
                  }
                  onClick={() => candidate && selectImage(candidate, "compose")}
                >
                  Continue with this photo
                  <ArrowRight />
                </Button>
              </footer>
            </>
          ) : stage === "lifestyle" ? (
            <>
              <div className="accepted-image">
                <button onClick={() => current && setZoom(current)}>
                  {current && <img src={current.url} alt={current.name} />}
                  <span>
                    <Expand size={16} />
                    Your accepted scene
                  </span>
                </button>
                <Button variant="outline" onClick={() => changeStage("review")}>
                  Skip additions · Review
                  <ArrowRight />
                </Button>
              </div>
              <Tabs
                value={generation}
                onValueChange={(v) => setGeneration(v as GenerationStage)}
              >
                <TabsList variant="line">
                  <TabsTrigger
                    value="people"
                    id="additions-tab-people"
                    aria-controls="additions-panel"
                  >
                    People
                  </TabsTrigger>
                  <TabsTrigger
                    value="objects"
                    id="additions-tab-objects"
                    aria-controls="additions-panel"
                  >
                    Objects
                  </TabsTrigger>
                </TabsList>
                <div
                  id="additions-panel"
                  role="tabpanel"
                  aria-labelledby={"additions-tab-" + generation}
                >
                  {generator()}
                </div>
              </Tabs>
              <footer className="workspace-footer">
                <div>
                  <small>Next accepted version</small>
                  <strong>
                    {byId.get(candidate ?? "")?.name ||
                      "Select a take or keep your current scene"}
                  </strong>
                </div>
                <div className="button-row">
                  <Button
                    variant="outline"
                    onClick={() => changeStage("review")}
                  >
                    Review current scene
                  </Button>
                  <Button
                    disabled={
                      !candidate ||
                      candidate === project?.current_id ||
                      busy ||
                      !["lifestyle", "composition"].includes(
                        byId.get(candidate)?.kind ?? "",
                      )
                    }
                    onClick={() =>
                      candidate && selectImage(candidate, "lifestyle")
                    }
                  >
                    Use this version
                    <Check />
                  </Button>
                </div>
              </footer>
              <details className="earlier">
                <summary>
                  <History size={16} />
                  Accepted versions
                </summary>
                <div className="version-list">
                  {assets
                    .filter((a) => a.project_id === project?.id && a.accepted)
                    .map((a) => (
                      <button
                        key={a.id}
                        onClick={() => selectImage(a.id, "lifestyle")}
                      >
                        <img src={a.thumbnail_url || a.url} alt={a.name} />
                        <span>
                          {a.name}
                          {a.id === project?.current_id
                            ? " · Current"
                            : " · Restore"}
                        </span>
                      </button>
                    ))}
                </div>
              </details>
            </>
          ) : (
            <>
              {current ? (
                <>
                  <div className="review-grid">
                    <div>
                      <div
                        className="review-image"
                        style={
                          crop === "original"
                            ? {}
                            : { aspectRatio: crop.replace(":", " / ") }
                        }
                      >
                        <img
                          src={current.url}
                          alt="Selected image crop preview"
                          style={
                            crop === "original"
                              ? {}
                              : {
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                  objectPosition: `${cropX}% ${cropY}%`,
                                }
                          }
                        />
                      </div>
                      <div className="button-row mt-3">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setZoom(current);
                            setCompare(true);
                          }}
                        >
                          <Expand />
                          Compare with source RV
                        </Button>
                        <span className="muted">
                          {current.width} × {current.height}
                        </span>
                      </div>
                    </div>
                    <section className="review-controls">
                      <h2>Ready for your campaign.</h2>
                      <label className="field-label">
                        Export framing
                        <Choice
                          value={crop}
                          onChange={(v) => {
                            setCrop(v);
                            setChecks((s) => ({ ...s, crop: false }));
                          }}
                          label="Export framing"
                          options={[
                            ["original", "Original master"],
                            ["16:9", "Wide · 16:9"],
                            ["1:1", "Square · 1:1"],
                            ["4:5", "Portrait · 4:5"],
                            ["9:16", "Story · 9:16"],
                          ]}
                        />
                      </label>
                      {crop !== "original" && (
                        <>
                          <label className="field-label">
                            Horizontal position
                            <Slider
                              aria-label="Horizontal crop position"
                              value={[cropX]}
                              onValueChange={(v) => {
                                setCropX(v[0]);
                                setChecks((s) => ({ ...s, crop: false }));
                              }}
                              min={0}
                              max={100}
                            />
                          </label>
                          <label className="field-label">
                            Vertical position
                            <Slider
                              aria-label="Vertical crop position"
                              value={[cropY]}
                              onValueChange={(v) => {
                                setCropY(v[0]);
                                setChecks((s) => ({ ...s, crop: false }));
                              }}
                              min={0}
                              max={100}
                            />
                          </label>
                        </>
                      )}
                      <div className="review-checks">
                        {(["rv", "scene", "crop"] as const).map((key, i) => (
                          <label key={key}>
                            <Checkbox
                              checked={checks[key]}
                              onCheckedChange={(v) =>
                                setChecks((s) => ({ ...s, [key]: v === true }))
                              }
                            />
                            <span>
                              {
                                [
                                  "RV shape, graphics and badges checked",
                                  "People, objects and shadows checked",
                                  "Framing and crop checked",
                                ][i]
                              }
                            </span>
                          </label>
                        ))}
                      </div>
                      {current.approved ? (
                        <>
                          <div className="approved-label">
                            <Check />
                            Approved and saved
                          </div>
                          <Button
                            onClick={download}
                            disabled={
                              busy || (crop !== "original" && !checks.crop)
                            }
                          >
                            <Download />
                            Download {crop === "original" ? "master" : "crop"}
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={approve}
                          disabled={
                            busy || !checks.rv || !checks.scene || !checks.crop
                          }
                        >
                          <Check />
                          Approve & save
                        </Button>
                      )}
                      <p className="help-text">
                        Only the image you approve enters your approved library.
                        Inspect small lettering against the original.
                      </p>
                    </section>
                  </div>
                  <details className="batch-detail">
                    <summary>Image provenance & prompt</summary>
                    <p>
                      {current.endpoint} · {current.quality} ·{" "}
                      {new Date(current.created_at).toLocaleString()}
                    </p>
                    <p className="prompt-readback">{current.prompt}</p>
                  </details>
                </>
              ) : (
                <div className="empty-state">
                  <p>Choose a finished composition first.</p>
                  <Button onClick={() => changeStage("compose")}>
                    Back to composition
                  </Button>
                </div>
              )}
            </>
          )}
        </main>
      </SidebarProvider>
      <Dialog
        open={uploadOpen}
        onOpenChange={(v) => {
          if (uploadProgress === null) setUploadOpen(v);
        }}
      >
        <DialogContent className="upload-dialog">
          <DialogHeader>
            <DialogTitle>
              Add{" "}
              {uploadKind === "rv"
                ? "an RV"
                : uploadKind === "prop"
                  ? "an object reference"
                  : "a landscape"}
            </DialogTitle>
            <DialogDescription>
              Original files are preserved in your library. JPG, PNG or WebP, up
              to 12 MB.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={upload}>
            <label className="field-label">
              Image file
              <Input
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                disabled={uploadProgress !== null}
              />
            </label>
            <label className="field-label">
              Name
              <Input
                name="name"
                required
                maxLength={120}
                placeholder={
                  uploadKind === "rv"
                    ? "Jayco Jay Flight · exterior"
                    : "Give this image a name"
                }
              />
            </label>
            {uploadKind === "rv" ? (
              <div className="field-grid">
                {["brand", "model", "year", "angle"].map((f) => (
                  <label key={f} className="field-label">
                    {f[0].toUpperCase() + f.slice(1)}
                    <Input name={f} maxLength={f === "year" ? 8 : 60} />
                  </label>
                ))}
              </div>
            ) : (
              <div className="field-grid">
                <label className="field-label">
                  Environment
                  <Input
                    name="environment"
                    placeholder="Alpine, desert, forest…"
                  />
                </label>
                <label className="field-label">
                  Lighting
                  <Input name="lighting" placeholder="Warm afternoon…" />
                </label>
              </div>
            )}
            {uploadProgress !== null && (
              <div className="upload-status" aria-live="polite">
                <Progress value={uploadProgress} />
                <span>
                  {uploadProgress < 100
                    ? `Uploading ${uploadProgress}%`
                    : "Saving your image…"}
                </span>
              </div>
            )}
            <Button
              type="submit"
              disabled={uploadProgress !== null}
              className="w-full mt-5"
            >
              {uploadProgress !== null ? (
                <LoaderCircle className="spinner" />
              ) : (
                <Upload />
              )}
              Add to library
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!zoom} onOpenChange={(v) => !v && setZoom(null)}>
        <DialogContent className="image-dialog">
          <DialogHeader>
            <DialogTitle>{zoom?.name}</DialogTitle>
            <DialogDescription>
              {zoom?.source === "sourced-photo" ? "Original sourced photograph. Inspect the full-resolution image and its provenance." : zoom?.source === "ai-sample"
                ? "AI-generated sample, not an actual branded unit."
                : zoom?.source === "uploaded"
                  ? "Original uploaded reference."
                  : "Inspect this generated image against your source."}
            </DialogDescription>
          </DialogHeader>
          {zoom?.photo_source && <PhotoSource asset={zoom} />}
          <div className="button-row">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomActual(!zoomActual)}
            >
              {zoomActual ? "Fit to screen" : "Actual size"}
            </Button>
            {rv && zoom?.id !== rv.id && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCompare(!compare)}
              >
                {compare ? "Single image" : "Compare RV"}
              </Button>
            )}
            <span className="muted">
              {zoom?.width || "Original"}
              {zoom?.height ? " × " + zoom.height : ""}
            </span>
          </div>
          <div
            className={
              "image-inspector " +
              (compare && rv && zoom?.id !== rv.id ? "comparing" : "")
            }
          >
            <div>
              {zoom && (zoom.photo_source ? <OriginalPhoto key={zoom.id} src={zoom.url} alt={zoom.name} className={zoomActual ? "actual-size" : ""} /> : <img src={zoom.url} alt={zoom.name} className={zoomActual ? "actual-size" : ""} />)}
            </div>
            {compare && rv && zoom?.id !== rv.id && (
              <div>
                <p>Original RV reference</p>
                <img src={rv.url} alt={rv.name} />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Sheet open={briefOpen} onOpenChange={setBriefOpen}>
        <SheetContent className="shot-sheet">
          <SheetHeader>
            <SheetTitle>Shot brief</SheetTitle>
            <SheetDescription>
              Your campaign and selected source images.
            </SheetDescription>
          </SheetHeader>
          <div className="sheet-body">
            <label className="field-label">
              Campaign name
              <Input
                defaultValue={project?.name}
                key={project?.id}
                onBlur={async (e) => {
                  if (e.target.value && e.target.value !== project?.name)
                    try {
                      replaceProject(
                        await api<Project>(
                          "projects/" + project?.id,
                          { name: e.target.value },
                          "PATCH",
                        ),
                      );
                    } catch (err) {
                      fail(err);
                    }
                }}
              />
            </label>
            {[rv, landscape, current].filter(Boolean).map((a, i) => (
              <div className="sheet-asset" key={i}>
                <img src={a!.thumbnail_url || a!.url} alt={a!.name} />
                <div>
                  <small>
                    {["RV reference", "Landscape", "Accepted scene"][i]}
                  </small>
                  <strong>{a!.name}</strong>
                </div>
              </div>
            ))}
            <div className="model-details">
              <h3>Generation settings</h3>
              <p>
                Landscapes, composition & objects
                <br />
                <strong>GPT Image 2.5 Sunburst · Max</strong>
              </p>
              <p>
                People
                <br />
                <strong>Meta Muse</strong>
              </p>
              <p>
                Image provider: fal ·{" "}
                {connected.fal ? "Connected" : "Not connected"}
              </p>
              <p>
                Prompt enhancement:{" "}
                {connected.openai ? "Connected" : "Not connected"}
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={campaignDialog} onOpenChange={setCampaignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new campaign</DialogTitle>
            <DialogDescription>
              Your existing campaigns and images stay saved.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Campaign name"
            placeholder="Autumn escapes"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
          />
          <Button
            disabled={busy || !campaignName.trim()}
            onClick={createCampaign}
          >
            Create campaign
            <ArrowRight />
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!saveAsset} onOpenChange={(v) => !v && setSaveAsset(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keep this in your library</DialogTitle>
            <DialogDescription>
              Reuse this image in future campaigns without generating it again.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Asset name"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
          />
          <Button onClick={saveToLibrary} disabled={!saveName.trim()}>
            <Save />
            Save to library
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
