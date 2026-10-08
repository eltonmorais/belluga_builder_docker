import { useEffect, useMemo, useRef, useState } from "react";
import "./prototype-viewer.css";

type Company = { id: string; name: string };
type Artifact = {
  id: string;
  kind: string;
  name: string;
  state: string;
  entry_point?: string;
  files?: string[];
  diagnostic?: string;
};
type PrototypeReference = {
  id: string;
  image: string;
  approval_evidence: string;
};
type PrototypeState = {
  id: string;
  name: string;
  identifier_image: string;
  approved_references: PrototypeReference[];
};
type PrototypeScreen = {
  id: string;
  name: string;
  path: string;
  default_state_id: string;
  states: PrototypeState[];
};
type PrototypeTransition = {
  from_screen_id: string;
  from_state_id: string;
  action: string;
  to_screen_id: string;
  to_state_id: string;
};
type PrototypeScenarioStep = { screen_id: string; state_id: string };
type PrototypeScenario = { id: string; name: string; steps: PrototypeScenarioStep[] };
type PrototypeItem = {
  id: string;
  name: string;
  root: string;
  status: "active" | "archived";
  authoring_mode: "image_first" | "design_system_first";
  entry_point: string;
  screens: PrototypeScreen[];
  transitions: PrototypeTransition[];
  scenarios: PrototypeScenario[];
};
type PrototypeStatus = { outcome?: string; items?: PrototypeItem[] };
type Project = {
  id: string;
  name: string;
  company_id: string;
  preparation_state: string;
  preparation_diagnostic?: string;
  snapshot_fingerprint?: string;
  artifacts: Artifact[];
};
type Catalog = { companies: Company[]; projects: Project[] };
type Detail = {
  consumer_readiness: string;
  snapshot_fingerprint?: string;
  snapshot_observed_at?: string;
  artifacts: Artifact[];
  snapshot_observations?: Record<string, unknown>;
  diagnostic?: string;
  next_action?: string;
};
type KnowledgeObservation = {
  landing?: { status?: string; reason_code?: string };
  roadmap?: { status?: string; reason_code?: string };
};
type VisualOriginObservation = {
  state?: "matching" | "mismatch" | "unverifiable";
  knowledge_source_state?: string;
  roadmap_source_state?: string;
  design_system_state?: string;
  generated_at_utc?: string;
  foundation_head_commit?: string;
  legacy_source_snapshot_encoding?: string;
};
type PresentationDevice = "mobile" | "desktop";
type PresentationScale = "fit" | "100";

function PresentationCanvas({
  companyID,
  projectID,
  companyName,
  projectName,
  prototypes,
  prototype,
  screen,
  state,
  fingerprint,
  pinnedFingerprint,
  device,
  scale,
  detailLoading,
  loadError,
  catalogLoading,
  artifactDiagnostic,
}: {
  companyID: string;
  projectID: string;
  companyName: string;
  projectName: string;
  prototypes: PrototypeItem[];
  prototype: PrototypeItem | undefined;
  screen: PrototypeScreen | undefined;
  state: PrototypeState | undefined;
  fingerprint: string;
  pinnedFingerprint: string;
  device: PresentationDevice;
  scale: PresentationScale;
  detailLoading: boolean;
  loadError: string;
  catalogLoading: boolean;
  artifactDiagnostic: string;
}) {
  const [, setQueryRevision] = useState(0);
  const canvasRef = useRef<HTMLElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth - 36, height: window.innerHeight - 82 });
  const [entryCheck, setEntryCheck] = useState<{
    key: string;
    status: "checking" | "ready" | "error";
    error?: string;
  } | null>(null);
  const currentQuery = new URLSearchParams(location.search);
  const activeDevice = currentQuery.get("device") === "desktop" ? "desktop" : device;
  const activeScale = currentQuery.get("scale") === "100" ? "100" : scale;
  const dimensions =
    activeDevice === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setCanvasSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  const query = new URLSearchParams(location.search);
  const selectedScenarioID = query.get("scenario_id") || "";
  const selectedScenarioStepRaw = query.get("scenario_step");
  const scenarioKeysPresent = query.has("scenario_id") || query.has("scenario_step");
  const selectedScenario = prototype?.scenarios?.find((item) => item.id === selectedScenarioID);
  const selectedScenarioStep = selectedScenarioStepRaw !== null && /^\d+$/.test(selectedScenarioStepRaw)
    ? Number(selectedScenarioStepRaw)
    : Number.NaN;
  const selectedStep = Number.isInteger(selectedScenarioStep) ? selectedScenario?.steps[selectedScenarioStep] : undefined;
  let scenarioError = "";
  if (scenarioKeysPresent) {
    if (!selectedScenarioID || selectedScenarioStepRaw === null || !Number.isInteger(selectedScenarioStep) || selectedScenarioStep < 0) {
      scenarioError = "O link contém uma seleção de cenário inválida.";
    } else if (!selectedScenario || !selectedStep) {
      scenarioError = "O cenário ou a etapa selecionada não existe neste snapshot.";
    } else if (selectedStep.screen_id !== screen?.id || selectedStep.state_id !== state?.id) {
      scenarioError = "A etapa do cenário não corresponde à Tela e ao Estado selecionados neste link.";
    }
  }
  const entryURL =
    prototype && screen && state && pinnedFingerprint
      ? `/snapshot/${encodeURIComponent(companyID)}/${encodeURIComponent(projectID)}/${pinnedFingerprint}/${`${prototype.root}/${screen.path}`.split("/").map(encodeURIComponent).join("/")}?prototype_state=${encodeURIComponent(state.id)}`
      : "";

  const updateQuery = (changes: Record<string, string | null>) => {
    const url = new URL(location.href);
    Object.entries(changes).forEach(([key, value]) => value === null ? url.searchParams.delete(key) : url.searchParams.set(key, value));
    history.replaceState({}, "", url);
    setQueryRevision((value) => value + 1);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  // URL state is authoritative for the entry point and display preset.
  const selectedPrototypeID = query.get("prototype_id") || "";
  const selectedScreenID = query.get("screen_id") || "";
  const selectedStateID = query.get("state_id") || "";
  const selectedDevice = query.get("device") || "";
  const selectedScale = query.get("scale") || "";
  const validPinnedFingerprint = /^[a-f0-9]{64}$/.test(pinnedFingerprint);
  const isValidSelection = Boolean(
    prototype && screen && state && prototype.id === selectedPrototypeID &&
      screen.id === selectedScreenID && state.id === selectedStateID &&
      validPinnedFingerprint &&
      ["mobile", "desktop"].includes(selectedDevice) &&
      ["fit", "100"].includes(selectedScale) && !scenarioError &&
      selectedDevice === activeDevice && selectedScale === activeScale,
  );
  const entryKey = `${entryURL}|${fingerprint}|${pinnedFingerprint}|${selectedScenarioID}|${selectedScenarioStepRaw ?? ""}`;
  const currentEntryCheck = entryCheck?.key === entryKey ? entryCheck : null;
  const entryStatus = currentEntryCheck?.status || "checking";
  const entryError = currentEntryCheck?.error || "";
  useEffect(() => {
    if (catalogLoading || detailLoading || loadError || !isValidSelection) return;
    if (!entryURL || !pinnedFingerprint) {
      setEntryCheck({
        key: entryKey,
        status: "error",
        error: "Seleção inválida. Escolha um Protótipo, Tela e Estado disponíveis.",
      });
      return;
    }
    if (fingerprint !== pinnedFingerprint) {
      setEntryCheck({
        key: entryKey,
        status: "error",
        error: "Snapshot alterado; reabra a apresentação pelo inspetor.",
      });
      return;
    }
    const controller = new AbortController();
    setEntryCheck({ key: entryKey, status: "checking" });
    fetch(entryURL, { method: "HEAD", signal: controller.signal })
      .then((response) => {
        if (!response.ok)
          throw new Error("O HTML desta entrada não está disponível no snapshot.");
        if (
          response.headers.get("X-Builder-Snapshot-Fingerprint") !==
          pinnedFingerprint
        ) {
          throw new Error("A resposta não corresponde ao fingerprint selecionado.");
        }
        if (!controller.signal.aborted)
          setEntryCheck({ key: entryKey, status: "ready" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setEntryCheck({
          key: entryKey,
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "Não foi possível verificar o HTML do snapshot.",
        });
      });
    return () => controller.abort();
  }, [catalogLoading, detailLoading, entryKey, entryURL, fingerprint, isValidSelection, loadError, pinnedFingerprint]);
  const validEntry = currentEntryCheck?.status === "ready" && isValidSelection && entryURL;
  const fitScale = activeScale === "fit"
    ? Math.max(0.1, Math.min(1, canvasSize.width / dimensions.width, canvasSize.height / dimensions.height))
    : 1;

  return (
    <main className="prototype-presentation">
      <header className="prototype-presentation-bar">
        <a className="prototype-presentation-exit" href={`/local?company_id=${encodeURIComponent(companyID)}&project_id=${encodeURIComponent(projectID)}&artifact=${encodeURIComponent(`prototype:${prototype?.id || ""}`)}`}>
          ← Sair
        </a>
        <span className="prototype-presentation-context">{companyName} / {projectName}</span>
        <label>Protótipo<select aria-label="Protótipo" value={prototype?.id || ""} onChange={(event) => {
          const next = prototypes.find((item) => item.id === event.target.value);
          const nextScreen = next?.screens.find((item) => item.path === next.entry_point) ?? next?.screens[0];
          const nextState = nextScreen?.states.find((item) => item.id === nextScreen.default_state_id) ?? nextScreen?.states[0];
          updateQuery({ artifact: `prototype:${next?.id || ""}`, prototype_id: next?.id || "", screen_id: nextScreen?.id || "", state_id: nextState?.id || "", scenario_id: null, scenario_step: null });
        }}>{prototypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Cenário<select aria-label="Cenário" value={scenarioKeysPresent ? selectedScenarioID : ""} onChange={(event) => {
          const next = prototype?.scenarios?.find((item) => item.id === event.target.value);
          const step = next?.steps[0];
          updateQuery({ scenario_id: next?.id || null, scenario_step: step ? "0" : null, screen_id: step?.screen_id || screen?.id || "", state_id: step?.state_id || state?.id || "" });
        }}><option value="">Exploração manual</option>{(prototype?.scenarios || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {selectedScenario && selectedStep && !scenarioError && <div className="prototype-presentation-scenario" role="group" aria-label="Etapas do cenário">
          <button aria-label="Etapa anterior" disabled={selectedScenarioStep <= 0} onClick={() => {
            const index = selectedScenarioStep - 1;
            const step = selectedScenario.steps[index];
            if (step) updateQuery({ scenario_step: String(index), screen_id: step.screen_id, state_id: step.state_id });
          }}>Anterior</button>
          <span aria-live="polite">Etapa {selectedScenarioStep + 1} de {selectedScenario.steps.length}</span>
          <button aria-label="Próxima etapa" disabled={selectedScenarioStep >= selectedScenario.steps.length - 1} onClick={() => {
            const index = selectedScenarioStep + 1;
            const step = selectedScenario.steps[index];
            if (step) updateQuery({ scenario_step: String(index), screen_id: step.screen_id, state_id: step.state_id });
          }}>Próxima</button>
        </div>}
        <label>Ir para tela<select aria-label="Ir para tela" value={screen?.id || ""} onChange={(event) => {
          const next = prototype?.screens.find((item) => item.id === event.target.value);
          const nextState = next?.states.find((item) => item.id === next.default_state_id) ?? next?.states[0];
          updateQuery({ screen_id: next?.id || "", state_id: nextState?.id || "", scenario_id: null, scenario_step: null });
        }}>{(prototype?.screens || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Estado<select aria-label="Estado" value={state?.id || ""} onChange={(event) => updateQuery({ state_id: event.target.value, scenario_id: null, scenario_step: null })}>{(screen?.states || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="prototype-presentation-toggle" role="group" aria-label="Dispositivo">
          <button aria-pressed={activeDevice === "mobile"} onClick={() => updateQuery({ device: "mobile" })}>Mobile</button>
          <button aria-pressed={activeDevice === "desktop"} onClick={() => updateQuery({ device: "desktop" })}>Desktop</button>
        </div>
        <div className="prototype-presentation-toggle" role="group" aria-label="Escala">
          <button aria-pressed={activeScale === "fit"} onClick={() => updateQuery({ scale: "fit" })}>Ajustar</button>
          <button aria-pressed={activeScale === "100"} onClick={() => updateQuery({ scale: "100" })}>100%</button>
        </div>
        {entryStatus === "ready" && validEntry && isValidSelection && entryURL ? <a href={entryURL} target="_blank" rel="noopener noreferrer">Abrir HTML bruto ↗</a> : <span aria-disabled="true">Abrir HTML bruto indisponível</span>}
        <details className="prototype-presentation-fingerprint">
          <summary aria-label={`Snapshot fingerprint ${pinnedFingerprint || "indisponível"}`}>
            Snapshot · {pinnedFingerprint ? `${pinnedFingerprint.slice(0, 8)}…` : "indisponível"}
          </summary>
          <code>{pinnedFingerprint || "indisponível"}</code>
        </details>
      </header>
      <section ref={canvasRef} className="prototype-presentation-canvas" style={{ justifyContent: activeScale === "100" ? "safe center" : "center" }} aria-label={`${companyName} / ${projectName} · apresentação`}>
        {catalogLoading ? <p role="status">Carregando registro local…</p>
          : loadError ? <p role="alert">{loadError}</p>
            : detailLoading ? <p role="status">Carregando dados do snapshot…</p>
              : !isValidSelection ? <p role="alert">{artifactDiagnostic || scenarioError || "Seleção inválida. Este link não identifica um Protótipo, Tela ou Estado disponível."}</p>
                : entryStatus === "checking" ? <p role="status">Verificando entrada do snapshot…</p>
                  : entryStatus === "error" ? <p role="alert">{entryError}</p>
                    : validEntry ? <div className="prototype-presentation-frame" style={{ width: dimensions.width * fitScale, height: dimensions.height * fitScale }}><iframe key={entryKey} title={`${prototype?.name} · ${screen?.name} · ${state?.name}`} src={entryURL} sandbox="allow-scripts" referrerPolicy="no-referrer" style={{ width: dimensions.width, height: dimensions.height, transform: `scale(${fitScale})`, transformOrigin: "top left" }} /></div> : null}
      </section>
    </main>
  );
}
const artifactKey = (artifact: Artifact) => `${artifact.kind}:${artifact.id}`;
const artifactKindLabel = (kind: string) =>
  kind === "design_system"
    ? "Design System"
    : kind === "prototype"
      ? "Protótipo"
      : kind === "landing"
        ? "Landing"
        : "Artefato";

export function LocalArtifactPreview() {
  const [catalog, setCatalog] = useState<Catalog>({
    companies: [],
    projects: [],
  });
  const [companyID, setCompanyID] = useState(
    new URLSearchParams(location.search).get("company_id") || "",
  );
  const [projectID, setProjectID] = useState(
    new URLSearchParams(location.search).get("project_id") || "",
  );
  const [artifactID, setArtifactID] = useState(
    new URLSearchParams(location.search).get("artifact") || "",
  );
  const [prototypeStatusFilter, setPrototypeStatusFilter] = useState<
    "active" | "archived" | "all"
  >("active");
  const [screenID, setScreenID] = useState("");
  const [stateID, setStateID] = useState("");
  const [expandedScreenID, setExpandedScreenID] = useState<string | null>(null);
  const [identifierImageResult, setIdentifierImageResult] = useState<{
    src: string;
    status: "loaded" | "error";
  } | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailKey, setDetailKey] = useState("");
  const [error, setError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const initialPresentationQuery = new URLSearchParams(location.search);
  const presentationMode = initialPresentationQuery.get("mode") === "presentation";
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/local-preview", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Registro local indisponível.");
        return r.json() as Promise<Catalog>;
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setCatalog(value);
          setCatalogLoading(false);
          const query = new URLSearchParams(location.search);
          const queryCompany = query.get("company_id") || "";
          const queryProject = query.get("project_id") || "";
          const queryArtifact = query.get("artifact") || "";
          if (queryCompany || queryProject) {
            const p = value.projects.find(
              (item) =>
                item.id === queryProject && item.company_id === queryCompany,
            );
            if (p) {
              setCompanyID(p.company_id);
              setProjectID(p.id);
              setArtifactID(queryArtifact);
              setScreenID(query.get("screen_id") || "");
              setStateID(query.get("state_id") || "");
            } else {
              setCompanyID("");
              setProjectID("");
              setError(
                "A Empresa/Project do endereço não existe no registro local.",
              );
            }
          }
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) {
          setCatalogLoading(false);
          setError(
            e instanceof Error
              ? e.message
              : "Falha ao carregar registro local.",
          );
        }
      });
    return () => controller.abort();
  }, []);
  const projects = useMemo(
    () => catalog.projects.filter((p) => p.company_id === companyID),
    [catalog.projects, companyID],
  );
  const project = projects.find((p) => p.id === projectID);
  useEffect(() => {
    if (!companyID || !project?.id) {
      setDetail(null);
      setDetailKey("");
      return;
    }
    const key = `${companyID}/${project.id}`;
    const controller = new AbortController();
    setDetail(null);
    setDetailKey("");
    fetch(
      `/api/local-preview?company_id=${encodeURIComponent(companyID)}&project_id=${encodeURIComponent(project.id)}`,
      { signal: controller.signal },
    )
      .then((r) => {
        if (!r.ok)
          throw new Error(
            "Snapshot local indisponível ou integridade não verificável.",
          );
        return r.json() as Promise<Detail>;
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setDetail(value);
          setDetailKey(key);
          setError("");
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Falha ao carregar snapshot.",
          );
      });
    return () => controller.abort();
  }, [companyID, project?.id]);
  const activeDetail =
    detailKey === `${companyID}/${project?.id || ""}` ? detail : null;
  const knowledge = activeDetail?.snapshot_observations?.knowledge_status as
    | KnowledgeObservation
    | undefined;
  const visualOrigin = activeDetail?.snapshot_observations?.visual_origin as
    | VisualOriginObservation
    | undefined;
  const detailVerified =
    activeDetail?.consumer_readiness === "ready" &&
    Boolean(activeDetail.snapshot_fingerprint);
  const prototypeStatus = activeDetail?.snapshot_observations
    ?.prototype_status as PrototypeStatus | undefined;
  const prototypes = useMemo(() => {
    if (!detailVerified || prototypeStatus?.outcome !== "go") return [];
    const availablePrototypeIDs = new Set(
      (activeDetail?.artifacts ?? [])
        .filter((artifact) => artifact.kind === "prototype" && artifact.state === "available" && artifact.entry_point)
        .map((artifact) => artifact.id),
    );
    return (prototypeStatus.items ?? []).filter((item) => availablePrototypeIDs.has(item.id));
  }, [activeDetail?.artifacts, detailVerified, prototypeStatus]);
  const prototypeByID = new Map(prototypes.map((item) => [item.id, item]));
  useEffect(() => {
    const selectedPrototype = prototypes.find(
      (item) => `prototype:${item.id}` === artifactID,
    );
    if (selectedPrototype) setPrototypeStatusFilter(selectedPrototype.status);
  }, [artifactID, prototypes]);
  const available = detailVerified
    ? activeDetail.artifacts.filter(
        (a) =>
          a.state === "available" &&
          a.entry_point &&
          (a.kind !== "prototype" || prototypeByID.has(a.id)),
      )
    : [];
  const visibleAvailable = available.filter(
    (item) =>
      item.kind !== "prototype" ||
      prototypeStatusFilter === "all" ||
      prototypeByID.get(item.id)?.status === prototypeStatusFilter,
  );
  const landingVisualState = detailVerified
    ? activeDetail.artifacts.find((a) => a.kind === "landing")?.state
    : undefined;
  const prototypeUnavailableDiagnostic = activeDetail?.artifacts.find(
    (artifact) => (artifact.kind === "prototype" || artifact.kind === "prototype_collection") && artifact.state === "invalid" && artifact.diagnostic,
  )?.diagnostic;
  const selected =
    visibleAvailable.find((a) => artifactKey(a) === artifactID) ??
    visibleAvailable[0];
  const selectedPrototype =
    selected?.kind === "prototype" ? prototypeByID.get(selected.id) : undefined;
  const selectedScreen =
    selectedPrototype?.screens.find((item) => item.id === screenID) ??
    selectedPrototype?.screens.find(
      (item) => item.path === selectedPrototype.entry_point,
    ) ??
    selectedPrototype?.screens[0];
  const selectedState =
    selectedScreen?.states.find((item) => item.id === stateID) ??
    selectedScreen?.states.find(
      (item) => item.id === selectedScreen.default_state_id,
    ) ??
    selectedScreen?.states[0];
  const openScreenID =
    expandedScreenID === null ? selectedScreen?.id : expandedScreenID;
  const select = (company: string, projectValue: string, artifact: string) => {
    const contextChanged = company !== companyID || projectValue !== projectID;
    if (artifact !== artifactID || contextChanged) {
      setScreenID("");
      setStateID("");
      setExpandedScreenID(null);
    }
    setCompanyID(company);
    setProjectID(projectValue);
    setArtifactID(artifact);
    if (contextChanged) {
      setDetail(null);
      setDetailKey("");
    }
    setError("");
    const url = new URL(location.href);
    if (company && projectValue) {
      url.searchParams.set("company_id", company);
      url.searchParams.set("project_id", projectValue);
    } else {
      url.searchParams.delete("company_id");
      url.searchParams.delete("project_id");
    }
    if (artifact) url.searchParams.set("artifact", artifact);
    else url.searchParams.delete("artifact");
    history.pushState({ company, projectValue, artifact }, "", url);
  };
  useEffect(() => {
    const onPop = () => {
      const q = new URLSearchParams(location.search);
      const nextCompanyID = q.get("company_id") || "";
      const nextProjectID = q.get("project_id") || "";
      const contextChanged =
        nextCompanyID !== companyID || nextProjectID !== projectID;
      setCompanyID(nextCompanyID);
      setProjectID(nextProjectID);
      setArtifactID(q.get("artifact") || "");
      setScreenID(q.get("screen_id") || "");
      setStateID(q.get("state_id") || "");
      setExpandedScreenID(null);
      if (contextChanged) {
        setDetail(null);
        setDetailKey("");
      }
      setError("");
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, [companyID, projectID]);
  const company = catalog.companies.find((c) => c.id === companyID);
  const snapshotURL = (path: string) =>
    activeDetail?.snapshot_fingerprint
      ? `/snapshot/${encodeURIComponent(companyID)}/${encodeURIComponent(project?.id || "")}/${activeDetail.snapshot_fingerprint}/${path.split("/").map(encodeURIComponent).join("/")}`
      : "";
  const prototypeScreenPath =
    selectedPrototype && selectedScreen
      ? `${selectedPrototype.root}/${selectedScreen.path}`
      : "";
  const previewPath = selectedPrototype
    ? prototypeScreenPath
    : selected?.entry_point || "";
  const src = previewPath
    ? `${snapshotURL(previewPath)}${selectedPrototype && selectedState ? `?prototype_state=${encodeURIComponent(selectedState.id)}` : ""}`
    : "";
  const presentationQuery = new URLSearchParams(location.search);
  const presentationPrototypeID = presentationQuery.get("prototype_id") || "";
  const presentationPrototype = prototypes.find(
    (item) => item.id === presentationPrototypeID,
  );
  const presentationArtifactDiagnostic = activeDetail?.artifacts.find(
    (artifact) => artifact.kind === "prototype" && artifact.id === presentationPrototypeID && artifact.state === "invalid" && artifact.diagnostic,
  )?.diagnostic || "";
  const presentationScreen = presentationPrototype?.screens.find(
    (item) => item.id === presentationQuery.get("screen_id"),
  );
  const presentationState = presentationScreen?.states.find(
    (item) => item.id === presentationQuery.get("state_id"),
  );
  const presentationURL = (device: PresentationDevice, scale: PresentationScale) => {
    const url = new URL("/local", location.origin);
    url.searchParams.set("mode", "presentation");
    url.searchParams.set("company_id", companyID);
    url.searchParams.set("project_id", project?.id || "");
    url.searchParams.set("artifact", `prototype:${selectedPrototype?.id || ""}`);
    url.searchParams.set("prototype_id", selectedPrototype?.id || "");
    url.searchParams.set("screen_id", selectedScreen?.id || "");
    url.searchParams.set("state_id", selectedState?.id || "");
    url.searchParams.set("fingerprint", activeDetail?.snapshot_fingerprint || "");
    url.searchParams.set("device", device);
    url.searchParams.set("scale", scale);
    return `${url.pathname}${url.search}`;
  };
  const identifierImageSrc =
    selectedPrototype && selectedState
      ? snapshotURL(
          `${selectedPrototype.root}/${selectedState.identifier_image}`,
        )
      : "";
  const identifierImageStatus =
    identifierImageResult?.src === identifierImageSrc
      ? identifierImageResult.status
      : "loading";
  if (presentationMode) {
    const expectedFingerprint = presentationQuery.get("fingerprint") || "";
    return (
      <PresentationCanvas
        companyID={companyID}
        projectID={project?.id || ""}
        companyName={company?.name || "Empresa"}
        projectName={project?.name || "Projeto"}
        prototypes={prototypes}
        prototype={presentationPrototype}
        screen={presentationScreen}
        state={presentationState}
        fingerprint={activeDetail?.snapshot_fingerprint || ""}
        pinnedFingerprint={expectedFingerprint}
        device={presentationQuery.get("device") === "desktop" ? "desktop" : "mobile"}
        scale={presentationQuery.get("scale") === "100" ? "100" : "fit"}
        detailLoading={Boolean(project && !activeDetail && !error)}
        loadError={error}
        catalogLoading={catalogLoading}
        artifactDiagnostic={presentationArtifactDiagnostic}
      />
    );
  }
  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <a className="workspace-brand" href="/local">
          <span className="workspace-logo">B</span>
          <span>
            <b>Builder</b>
            <small>PAINEL LOCAL · SOMENTE LEITURA</small>
          </span>
        </a>
        <label className="workspace-selector">
          EMPRESA
          <select
            aria-label="Empresa"
            value={companyID}
            onChange={(e) => {
              const next = catalog.projects.find(
                (p) => p.company_id === e.target.value,
              );
              select(e.target.value, next?.id || "", "");
            }}
          >
            <option value="">Selecionar empresa</option>
            {catalog.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="workspace-selector">
          PROJETO
          <select
            aria-label="Projeto"
            value={project?.id || ""}
            onChange={(e) => select(companyID, e.target.value, "")}
          >
            <option value="">Selecionar projeto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className="workspace-nav-label">ARTEFATOS</p>
        {prototypes.length > 0 && (
          <label className="workspace-selector workspace-prototype-filter">
            STATUS DO PROTÓTIPO
            <select
              aria-label="Status do protótipo"
              value={prototypeStatusFilter}
              onChange={(e) => {
                const next = e.target.value as "active" | "archived" | "all";
                setPrototypeStatusFilter(next);
                if (
                  selectedPrototype &&
                  next !== "all" &&
                  selectedPrototype.status !== next
                ) {
                  const nextArtifact = available.find(
                    (item) =>
                      item.kind !== "prototype" ||
                      prototypeByID.get(item.id)?.status === next,
                  );
                  if (nextArtifact)
                    select(
                      companyID,
                      project?.id || "",
                      artifactKey(nextArtifact),
                    );
                }
              }}
            >
              <option value="active">Ativos</option>
              <option value="archived">Arquivados</option>
              <option value="all">Todos</option>
            </select>
          </label>
        )}
        {prototypeStatusFilter !== "all" &&
          !visibleAvailable.some((item) => item.kind === "prototype") && (
            <p className="workspace-prototype-empty">
              Nenhum protótipo{" "}
              {prototypeStatusFilter === "archived" ? "arquivado" : "ativo"}{" "}
              disponível.
            </p>
          )}
        {visibleAvailable.map((item) => {
          const prototype = prototypeByID.get(item.id);
          return (
            <button
              key={artifactKey(item)}
              className={`workspace-nav ${selected && artifactKey(selected) === artifactKey(item) ? "selected" : ""}`}
              onClick={() =>
                select(companyID, project?.id || "", artifactKey(item))
              }
            >
              <small aria-hidden="true">
                {artifactKindLabel(item.kind)}
                {prototype
                  ? ` · ${prototype.status === "active" ? "Ativo" : "Arquivado"}`
                  : ""}
              </small>
              {item.name}
            </button>
          );
        })}
        <div className="workspace-sidebar-foot">
          <span className="workspace-dot" /> LOCAL · SOMENTE LEITURA
          <br />
          <small>Registro não significa revisão ou aprovação</small>
        </div>
      </aside>
      <main className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-crumb">
            {company?.name || "Empresa"} <span>/</span>{" "}
            {project?.name || "Projeto"} <span>/</span>{" "}
            <b>{selected?.name || "Visão geral"}</b>
          </div>
          <span className="workspace-local-badge">
            <i />
            Prévia local
          </span>
        </header>
        <div
          className={`workspace-toolbar ${selected?.kind === "prototype" ? "workspace-toolbar-prototype" : ""}`}
        >
          <div>
            <p>PROJETO · {project?.id || "NÃO SELECIONADO"}</p>
            <h1>{selected?.name || "Artefatos locais"}</h1>
          </div>
          {src && (
            <a
              className={`workspace-direct ${selected?.kind === "prototype" ? "workspace-direct-prototype" : ""}`}
              href={selected?.kind === "prototype" ? presentationURL("mobile", "fit") : src}
              target="_blank"
              rel="noopener noreferrer"
            >
              {selected?.kind === "prototype"
                ? "Abrir apresentação do protótipo ↗"
                : "Abrir artefato isolado ↗"}
            </a>
          )}
          {src && selected?.kind === "prototype" && (
            <a className="workspace-direct-raw" href={src} target="_blank" rel="noopener noreferrer">Abrir HTML bruto ↗</a>
          )}
        </div>
        {error && (
          <p role="alert" className="workspace-error">
            {error}
          </p>
        )}
        {activeDetail?.consumer_readiness === "not_ready" &&
          (activeDetail.diagnostic || activeDetail.next_action) && (
            <p role="alert" className="workspace-error">
              {activeDetail.diagnostic} {activeDetail.next_action}
            </p>
          )}
        {detailVerified && prototypeUnavailableDiagnostic && (
          <p role="alert" className="workspace-error">{prototypeUnavailableDiagnostic}</p>
        )}
        {!project && (
          <p>
            Registre um Project explicitamente para exibi-lo neste painel local.
          </p>
        )}
        {project && (
          <details className="workspace-status">
            <summary>
              Estado do registro <span>· revisão humana separada</span>
            </summary>
            <p>
              Integridade dos bytes salvos:{" "}
              {detailVerified
                ? "snapshot verificado"
                : "não verificado nesta leitura"}
              . Fingerprint{" "}
              <code>
                {activeDetail?.snapshot_fingerprint || "indisponível"}
              </code>
              . Preparação observada em{" "}
              {activeDetail?.snapshot_observed_at || "indisponível"}.
            </p>
            <p>
              Observação de revisão documental salva (Knowledge status da
              preparação): Landing{" "}
              {knowledge?.landing?.status || "sem observação verificada"} (
              {knowledge?.landing?.reason_code || "—"}); Roadmap{" "}
              {knowledge?.roadmap?.status || "sem observação verificada"} (
              {knowledge?.roadmap?.reason_code || "—"}). Esses estados dizem
              respeito à revisão dos documentos, não à aprovação da Landing
              visual.
            </p>
            <p>
              Origem da Landing visual (comparação feita na preparação):{" "}
              {detailVerified
                ? `${visualOrigin?.state || "unverifiable"}; Knowledge ${visualOrigin?.knowledge_source_state || "unverifiable"}, Roadmap ${visualOrigin?.roadmap_source_state || "unverifiable"}, Design System ${visualOrigin?.design_system_state || "unverifiable"}`
                : "indisponível até que o snapshot seja verificado"}
              . A origem não é consultada ao vivo. A codificação histórica
              separada é{" "}
              <code>
                {visualOrigin?.legacy_source_snapshot_encoding ||
                  "não informada"}
              </code>
              .
            </p>
            <p>
              Disponibilidade do arquivo Landing:{" "}
              {detailVerified
                ? landingVisualState || "sem observação"
                : "não verificada"}
              . Isso não significa aprovação de fidelidade visual.
            </p>
            <p>
              Revisão humana:{" "}
              {knowledge?.landing?.reason_code === "review_missing"
                ? "marcador ausente na observação documental salva"
                : "não é inferida pela preparação"}
              . Fidelidade visual também não é aprovada por este painel.
            </p>
            {activeDetail?.diagnostic && (
              <p className="workspace-warning">{activeDetail.diagnostic}</p>
            )}
            {(activeDetail?.artifacts ?? []).map((a) => (
              <p key={artifactKey(a)}>
                {a.name}: {a.state}
                {a.diagnostic ? ` · ${a.diagnostic}` : ""}
              </p>
            ))}
          </details>
        )}
        {selectedPrototype && selectedScreen && selectedState && (
          <section
            className="workspace-prototype"
            aria-label="Navegação do protótipo"
          >
            <div className="workspace-prototype-outline">
              <div className="workspace-prototype-heading">
                <span>
                  PROTÓTIPO ·{" "}
                  {selectedPrototype.status === "active"
                    ? "ATIVO"
                    : "ARQUIVADO"}
                </span>
                <strong>
                  {selectedPrototype.authoring_mode === "image_first"
                    ? "Exploração visual"
                    : "Design System direto"}
                </strong>
              </div>
              {selectedPrototype.screens.map((screen) => (
                <div className="workspace-screen-group" key={screen.id}>
                  <button
                    type="button"
                    aria-expanded={openScreenID === screen.id}
                    className={`workspace-screen-button ${selectedScreen.id === screen.id ? "selected" : ""}`}
                    onClick={() => {
                      if (openScreenID === screen.id) {
                        setExpandedScreenID("");
                      } else {
                        setExpandedScreenID(screen.id);
                        setScreenID(screen.id);
                        setStateID(screen.default_state_id);
                      }
                    }}
                  >
                    <span>{screen.name}</span>
                    <small>{screen.id}</small>
                  </button>
                  {openScreenID === screen.id && (
                    <div
                      className="workspace-state-list"
                      aria-label={`Estados de ${screen.name}`}
                    >
                      {screen.states.map((state) => (
                        <button
                          type="button"
                          key={state.id}
                          aria-pressed={
                            selectedScreen.id === screen.id &&
                            selectedState.id === state.id
                          }
                          className={`workspace-state-button ${selectedScreen.id === screen.id && selectedState.id === state.id ? "selected" : ""}`}
                          onClick={() => {
                            setExpandedScreenID(screen.id);
                            setScreenID(screen.id);
                            setStateID(state.id);
                          }}
                        >
                          {state.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="workspace-prototype-evidence">
              <div className="workspace-prototype-evidence-heading">
                <div>
                  <small>TELA · {selectedScreen.id}</small>
                  <h2>
                    {selectedScreen.name} <span>/</span> {selectedState.name}
                  </h2>
                </div>
                <span>
                  Estado padrão:{" "}
                  {selectedScreen.default_state_id === selectedState.id
                    ? "sim"
                    : "não"}
                </span>
              </div>
              <div className="workspace-reference-grid">
                <figure>
                  <img
                    key={identifierImageSrc}
                    src={identifierImageSrc}
                    onLoad={() =>
                      setIdentifierImageResult({
                        src: identifierImageSrc,
                        status: "loaded",
                      })
                    }
                    onError={() =>
                      setIdentifierImageResult({
                        src: identifierImageSrc,
                        status: "error",
                      })
                    }
                    alt={`Imagem identificadora declarada · ${selectedScreen.name} · ${selectedState.name}`}
                  />
                  <figcaption>Imagem identificadora deste estado</figcaption>
                </figure>
                {selectedState.approved_references.map((reference) => (
                  <figure key={reference.id}>
                    <img
                      src={snapshotURL(
                        `${selectedPrototype.root}/${reference.image}`,
                      )}
                      alt={`Referência visual aprovada declarada · ${reference.id}`}
                    />
                    <figcaption>
                      <b>Referência visual aprovada declarada</b>
                      <span>{reference.id}</span>
                      <a
                        href={snapshotURL(reference.approval_evidence)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir evidência associada ↗
                      </a>
                    </figcaption>
                  </figure>
                ))}
              </div>
              {identifierImageStatus === "loading" && (
                <p className="workspace-prototype-image-status" role="status">
                  Carregando imagem identificadora…
                </p>
              )}
              {identifierImageStatus === "loaded" && (
                <p className="workspace-prototype-image-status" role="status">
                  Imagem identificadora carregada.
                </p>
              )}
              {identifierImageStatus === "error" && (
                <p className="workspace-prototype-image-error" role="alert">
                  Não foi possível carregar a imagem identificadora deste estado.
                </p>
              )}
              {selectedState.approved_references.length === 0 && (
                <p className="workspace-no-reference">
                  Nenhuma referência visual aprovada foi registrada para este
                  estado.
                </p>
              )}
              <div className="workspace-prototype-transitions">
                <strong>Transições deste estado</strong>
                {selectedPrototype.transitions.filter(
                  (transition) =>
                    transition.from_screen_id === selectedScreen.id &&
                    transition.from_state_id === selectedState.id,
                ).length ? (
                  <ul>
                    {selectedPrototype.transitions
                      .filter(
                        (transition) =>
                          transition.from_screen_id === selectedScreen.id &&
                          transition.from_state_id === selectedState.id,
                      )
                      .map((transition) => (
                        <li
                          key={`${transition.action}-${transition.to_screen_id}-${transition.to_state_id}`}
                        >
                          {transition.action}{" "}
                          <span>
                            →{" "}
                            {
                              selectedPrototype.screens.find(
                                (screen) =>
                                  screen.id === transition.to_screen_id,
                              )?.name
                            }{" "}
                            /{" "}
                            {
                              selectedPrototype.screens
                                .find(
                                  (screen) =>
                                    screen.id === transition.to_screen_id,
                                )
                                ?.states.find(
                                  (state) =>
                                    state.id === transition.to_state_id,
                                )?.name
                            }
                          </span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p>Nenhuma transição registrada.</p>
                )}
              </div>
            </div>
          </section>
        )}
        {selected?.kind !== "prototype" && (
          <section
            className="workspace-stage"
            aria-label={`${selected?.name || "Artefato"} selecionado`}
          >
            {src ? (
              <iframe
                key={src}
                title={`${selected?.name} · artefato isolado`}
                src={src}
                sandbox=""
                referrerPolicy="no-referrer"
              />
            ) : (
              <p>
                Selecione uma Empresa e um Projeto registrado com artefatos
                disponíveis.
              </p>
            )}
          </section>
        )}
        <footer className="workspace-footer">
          Snapshot imutável · fingerprint identifica o conteúdo salvo · sem
          publicação
        </footer>
      </main>
    </div>
  );
}
