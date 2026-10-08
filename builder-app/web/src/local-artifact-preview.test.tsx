import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LocalArtifactPreview } from "./local-artifact-preview";

const catalog = {
  companies: [
    { id: "company-a", name: "Company A" },
    { id: "company-b", name: "Company B" },
  ],
  projects: [
    {
      id: "project-a",
      name: "Project A",
      company_id: "company-a",
      preparation_state: "ready",
      snapshot_fingerprint: "a".repeat(64),
      artifacts: [
        {
          id: "landing",
          kind: "landing",
          name: "Landing A",
          state: "available",
          entry_point: "design/landing/index.html",
        },
        {
          id: "landing",
          kind: "prototype",
          name: "Prototype with colliding ID",
          state: "available",
          entry_point: "prototypes/demo/start.html",
        },
        {
          id: "archived-demo",
          kind: "prototype",
          name: "Archived Prototype",
          state: "available",
          entry_point: "prototypes/old/start.html",
        },
      ],
    },
    {
      id: "project-b",
      name: "Project B",
      company_id: "company-b",
      preparation_state: "ready",
      snapshot_fingerprint: "b".repeat(64),
      artifacts: [
        {
          id: "landing-b",
          kind: "landing",
          name: "Landing B",
          state: "available",
          entry_point: "design/landing/index.html",
        },
      ],
    },
  ],
};
const detail = (
  fp: string,
  artifacts: {
    id: string;
    kind: string;
    name: string;
    state?: string;
    entry_point?: string;
  }[],
  includeArchived = true,
) => ({
  consumer_readiness: "ready",
  snapshot_fingerprint: fp,
  snapshot_observed_at: "2026-10-07T00:00:00Z",
  artifacts,
  snapshot_observations: {
    knowledge_status: {
      landing: { status: "unverifiable", reason_code: "review_missing" },
      roadmap: { status: "current", reason_code: "review_matches" },
    },
    visual_origin: {
      state: "unverifiable",
      knowledge_source_state: "matching",
      roadmap_source_state: "unverifiable",
      design_system_state: "unverifiable",
      legacy_source_snapshot_encoding:
        "sha256-utf8-sorted-path-tab-content-sha256-newline-v1",
    },
    prototype_status: {
      outcome: "go",
      items: artifacts
        .filter((item) => item.kind === "prototype")
        .map((item) => ({
          id: item.id,
          name: item.name,
          root:
            item.entry_point?.split("/").slice(0, -1).join("/") ||
            "prototypes/demo",
          status:
            includeArchived && item.id === "archived-demo"
              ? "archived"
              : "active",
          authoring_mode: "image_first",
          entry_point: item.entry_point?.split("/").at(-1) || "start.html",
          screens: [
            {
              id: "details",
              name: "Details",
              path: "details.html",
              default_state_id: "collapsed",
              states: [
                {
                  id: "collapsed",
                  name: "Collapsed",
                  identifier_image: "visuals/collapsed.png",
                  approved_references: [
                    {
                      id: "approved-layout",
                      image: "visuals/reference.png",
                      approval_evidence: "modules/approval.md",
                    },
                  ],
                },
                {
                  id: "expanded",
                  name: "Expanded",
                  identifier_image: "visuals/expanded.png",
                  approved_references: [],
                },
              ],
            },
            {
              id: "start",
              name: "Start",
              path: "start.html",
              default_state_id: "initial",
              states: [
                {
                  id: "initial",
                  name: "Initial",
                  identifier_image: "visuals/start.png",
                  approved_references: [],
                },
              ],
            },
          ],
          transitions: [
            {
              from_screen_id: "start",
              from_state_id: "initial",
              action: "Open details",
              to_screen_id: "details",
              to_state_id: "collapsed",
            },
            {
              from_screen_id: "details",
              from_state_id: "collapsed",
              action: "Expand",
              to_screen_id: "details",
              to_state_id: "expanded",
            },
          ],
        })),
    },
  },
});
const response = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

describe("LocalArtifactPreview", () => {
  afterEach(() => {
    cleanup();
    history.replaceState({}, "", "/");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it("shows a saved Prototype schema TEACH diagnostic without rendering a broken preview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: RequestInfo | URL) =>
        String(url) === "/api/local-preview"
          ? response(catalog)
          : response({
              ...detail("a".repeat(64), catalog.projects[0].artifacts),
              consumer_readiness: "not_ready",
              diagnostic:
                "The saved Prototype uses an unsupported schema and cannot be displayed.",
              next_action:
                "TEACH: refresh this matching Project with builder-project register, then load the panel again.",
            }),
      ),
    );
    render(<LocalArtifactPreview />);
    await screen.findByRole("option", { name: "Company A" });
    fireEvent.change(screen.getByRole("combobox", { name: "Empresa" }), {
      target: { value: "company-a" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "unsupported schema",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("TEACH");
    expect(
      screen.queryByTitle("Landing A · artefato isolado"),
    ).not.toBeInTheDocument();
  });

  it("selects registered Company/Project, loads current observations and serves fingerprint-scoped entry", async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      const value = String(url);
      if (value === "/api/local-preview") return response(catalog);
      return value.includes("project-b")
        ? response(detail("b".repeat(64), catalog.projects[1].artifacts))
        : response(detail("a".repeat(64), catalog.projects[0].artifacts));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LocalArtifactPreview />);
    await screen.findByRole("option", { name: "Company A" });
    fireEvent.change(screen.getByRole("combobox", { name: "Empresa" }), {
      target: { value: "company-a" },
    });
    await screen.findByTitle("Landing A · artefato isolado");
    expect(screen.getByText(/Protótipo/)).toBeInTheDocument();
    expect(
      screen.getByText(/^Landing/, { selector: "small" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/revisão humana separada/).closest("details"),
    ).not.toHaveAttribute("open");
    expect(screen.getByTitle("Landing A · artefato isolado")).toHaveAttribute(
      "src",
      `/snapshot/company-a/project-a/${"a".repeat(64)}/design/landing/index.html`,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Prototype with colliding ID" }),
    );
    const prototype = await screen.findByRole("link", {
      name: "Abrir apresentação do protótipo ↗",
    });
    expect(prototype).toHaveAttribute(
      "href",
      `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=start&state_id=initial&fingerprint=${"a".repeat(64)}&device=mobile&scale=fit`,
    );
    expect(prototype).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Abrir HTML bruto ↗" })).toHaveAttribute(
      "href",
      `/snapshot/company-a/project-a/${"a".repeat(64)}/prototypes/demo/start.html?prototype_state=initial`,
    );
    expect(
      screen.queryByTitle("Prototype with colliding ID · artefato isolado"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Empresa" }), {
      target: { value: "company-b" },
    });
    await screen.findByTitle("Landing B · artefato isolado");
    expect(
      screen.getByTitle("Landing B · artefato isolado").getAttribute("sandbox"),
    ).toBe("");
    expect(location.search).toContain("project_id=project-b");
    expect(screen.getByText(/revisão humana separada/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Landing unverifiable \(review_missing\); Roadmap current/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/origem não é consultada ao vivo/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Preparação observada em 2026-10-07T00:00:00Z/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Origem da Landing visual .*unverifiable/),
    ).toBeInTheDocument();
  });

  it("lists active and archived Prototypes and previews a selected Screen state with its evidence", async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) =>
      String(url) === "/api/local-preview"
        ? response(catalog)
        : response(detail("a".repeat(64), catalog.projects[0].artifacts)),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<LocalArtifactPreview />);
    await screen.findByRole("option", { name: "Company A" });
    fireEvent.change(screen.getByRole("combobox", { name: "Empresa" }), {
      target: { value: "company-a" },
    });
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Prototype with colliding ID",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Start / Initial" }),
    ).toBeInTheDocument();
    const initialPath = `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=start&state_id=initial&fingerprint=${"a".repeat(64)}&device=mobile&scale=fit`;
    expect(
      screen.getByRole("link", { name: "Abrir apresentação do protótipo ↗" }),
    ).toHaveAttribute("href", initialPath);
    expect(
      screen.queryByTitle("Prototype with colliding ID · artefato isolado"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Open details")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Details/ }));
    expect(
      await screen.findByRole("heading", { name: "Details / Collapsed" }),
    ).toBeInTheDocument();
    const detailsPath = `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=details&state_id=collapsed&fingerprint=${"a".repeat(64)}&device=mobile&scale=fit`;
    expect(
      screen.getByRole("link", { name: "Abrir apresentação do protótipo ↗" }),
    ).toHaveAttribute("href", detailsPath);
    expect(
      screen.getByAltText(
        "Imagem identificadora declarada · Details · Collapsed",
      ),
    ).toHaveAttribute(
      "src",
      `/snapshot/company-a/project-a/${"a".repeat(64)}/prototypes/demo/visuals/collapsed.png`,
    );
    expect(
      screen.getByText("Referência visual aprovada declarada"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Abrir evidência associada ↗" }),
    ).toHaveAttribute(
      "href",
      `/snapshot/company-a/project-a/${"a".repeat(64)}/modules/approval.md`,
    );
    expect(screen.getByText("Expand")).toBeInTheDocument();
    expect(screen.getByText("Expanded")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expanded" }));
    expect(
      screen.getByRole("link", { name: "Abrir apresentação do protótipo ↗" }),
    ).toHaveAttribute(
      "href",
      `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=details&state_id=expanded&fingerprint=${"a".repeat(64)}&device=mobile&scale=fit`,
    );
    const readsBeforeFilter = fetchMock.mock.calls.length;
    fireEvent.change(
      screen.getByRole("combobox", { name: "Status do protótipo" }),
      { target: { value: "archived" } },
    );
    expect(fetchMock).toHaveBeenCalledTimes(readsBeforeFilter);
    expect(
      await screen.findByRole("button", { name: "Archived Prototype" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Prototype with colliding ID" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Archived Prototype" }));
    expect(
      await screen.findByRole("heading", { name: "Start / Initial" }),
    ).toBeInTheDocument();
    expect(screen.getByText("PROTÓTIPO · ARQUIVADO")).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Status do protótipo" }),
      { target: { value: "all" } },
    );
    expect(fetchMock).toHaveBeenCalledTimes(readsBeforeFilter);
    expect(
      screen.getByRole("button", { name: "Prototype with colliding ID" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Archived Prototype" }),
    ).toBeInTheDocument();
  }, 15000);

  it("keeps only the selected Screen expanded and preserves evidence when it is collapsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: RequestInfo | URL) =>
        String(url) === "/api/local-preview"
          ? response(catalog)
          : response(detail("a".repeat(64), catalog.projects[0].artifacts)),
      ),
    );
    render(<LocalArtifactPreview />);
    await screen.findByRole("option", { name: "Company A" });
    fireEvent.change(screen.getByRole("combobox", { name: "Empresa" }), {
      target: { value: "company-a" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Prototype with colliding ID" }),
    );

    const start = screen.getByRole("button", { name: /Start/ });
    const details = screen.getByRole("button", { name: /Details/ });
    expect(start).toHaveAttribute("aria-expanded", "true");
    expect(details).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Initial" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Collapsed" })).not.toBeInTheDocument();

    fireEvent.click(details);
    expect(details).toHaveAttribute("aria-expanded", "true");
    expect(start).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Collapsed" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Details / Collapsed" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir apresentação do protótipo ↗" })).toHaveAttribute(
      "href",
      `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=details&state_id=collapsed&fingerprint=${"a".repeat(64)}&device=mobile&scale=fit`,
    );

    fireEvent.click(details);
    expect(details).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Collapsed" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Details / Collapsed" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir apresentação do protótipo ↗" })).toHaveAttribute(
      "href",
      `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=details&state_id=collapsed&fingerprint=${"a".repeat(64)}&device=mobile&scale=fit`,
    );
  });

  it("announces identifier image loading, success and failure for the selected State", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: RequestInfo | URL) =>
        String(url) === "/api/local-preview"
          ? response(catalog)
          : response(detail("a".repeat(64), catalog.projects[0].artifacts)),
      ),
    );
    render(<LocalArtifactPreview />);
    await screen.findByRole("option", { name: "Company A" });
    fireEvent.change(screen.getByRole("combobox", { name: "Empresa" }), {
      target: { value: "company-a" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Prototype with colliding ID" }),
    );

    const image = screen.getByAltText("Imagem identificadora declarada · Start · Initial");
    expect(screen.getByRole("status")).toHaveTextContent("Carregando imagem");
    fireEvent.load(image);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Imagem identificadora carregada",
    );

    fireEvent.click(screen.getByRole("button", { name: /Details/ }));
    const failedImage = screen.getByAltText(
      "Imagem identificadora declarada · Details · Collapsed",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Carregando imagem");
    fireEvent.error(failedImage);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("ignores a late image load from the previously selected State", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: RequestInfo | URL) =>
        String(url) === "/api/local-preview"
          ? response(catalog)
          : response(detail("a".repeat(64), catalog.projects[0].artifacts)),
      ),
    );
    render(<LocalArtifactPreview />);
    await screen.findByRole("option", { name: "Company A" });
    fireEvent.change(screen.getByRole("combobox", { name: "Empresa" }), {
      target: { value: "company-a" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Prototype with colliding ID" }),
    );

    const previousImage = screen.getByAltText(
      "Imagem identificadora declarada · Start · Initial",
    );
    fireEvent.click(screen.getByRole("button", { name: /Details/ }));
    const selectedImage = screen.getByAltText(
      "Imagem identificadora declarada · Details · Collapsed",
    );
    fireEvent.load(previousImage);
    expect(screen.getByRole("status")).toHaveTextContent("Carregando imagem");
    fireEvent.load(selectedImage);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Imagem identificadora carregada",
    );
  });

  it("resets the Screen accordion and State when browser history selects another Prototype", async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (String(url) === "/api/local-preview") return response(catalog);
      const value = detail("a".repeat(64), catalog.projects[0].artifacts);
      const items = value.snapshot_observations.prototype_status.items;
      const active = items.find((item) => item.id === "landing");
      const archived = items.find((item) => item.id === "archived-demo");
      if (active) {
        active.screens = [
          {
            id: "shared-screen",
            name: "Active Home",
            path: "active-home.html",
            default_state_id: "active-default",
            states: [
              {
                id: "active-default",
                name: "Active Default",
                identifier_image: "visuals/active.png",
                approved_references: [],
              },
              {
                id: "shared-non-default",
                name: "Active Non-default",
                identifier_image: "visuals/active-alt.png",
                approved_references: [],
              },
            ],
          },
        ];
        active.entry_point = "active-home.html";
      }
      if (archived) {
        archived.screens = [
          {
            id: "archive-home",
            name: "Archive Home",
            path: "archive-home.html",
            default_state_id: "archive-default",
            states: [
              {
                id: "archive-default",
                name: "Archive Default",
                identifier_image: "visuals/archive.png",
                approved_references: [],
              },
            ],
          },
          {
            id: "shared-screen",
            name: "Archive Details",
            path: "archive-details.html",
            default_state_id: "archive-collapsed",
            states: [
              {
                id: "archive-collapsed",
                name: "Archive Collapsed",
                identifier_image: "visuals/collapsed.png",
                approved_references: [],
              },
              {
                id: "shared-non-default",
                name: "Archive Expanded",
                identifier_image: "visuals/expanded.png",
                approved_references: [],
              },
            ],
          },
        ];
        archived.entry_point = "archive-home.html";
      }
      return response(value);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LocalArtifactPreview />);
    await screen.findByRole("option", { name: "Company A" });
    fireEvent.change(screen.getByRole("combobox", { name: "Empresa" }), {
      target: { value: "company-a" },
    });
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Prototype with colliding ID",
      }),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Status do protótipo" }),
      { target: { value: "all" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Archived Prototype" }));
    fireEvent.click(screen.getByRole("button", { name: /Archive Details/ }));
    fireEvent.click(screen.getByRole("button", { name: "Archive Expanded" }));
    fireEvent.change(
      screen.getByRole("combobox", { name: "Status do protótipo" }),
      { target: { value: "all" } },
    );

    const detailFetchesBeforePop = fetchMock.mock.calls.filter(([url]) =>
      String(url).startsWith("/api/local-preview?"),
    ).length;
    history.replaceState(
      {},
      "",
      "/local?company_id=company-a&project_id=project-a&artifact=prototype%3Alanding",
    );
    fireEvent.popState(window);

    expect(
      await screen.findByRole("heading", { name: "Active Home / Active Default" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Abrir apresentação do protótipo ↗" }),
    ).toHaveAttribute(
      "href",
      `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=shared-screen&state_id=active-default&fingerprint=${"a".repeat(64)}&device=mobile&scale=fit`,
    );
    const screenButtons = screen.getAllByRole("button", { name: /Active Home|Archive/ });
    expect(screen.getByRole("button", { name: /Active Home/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screenButtons.filter((button) => button.getAttribute("aria-expanded") === "true"))
      .toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).startsWith("/api/local-preview?"),
      ),
    ).toHaveLength(detailFetchesBeforePop);
  });

  it("explains when the selected lifecycle filter has no available Prototype", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: RequestInfo | URL) =>
        String(url) === "/api/local-preview"
          ? response(catalog)
          : response(
              detail("a".repeat(64), catalog.projects[0].artifacts, false),
            ),
      ),
    );
    render(<LocalArtifactPreview />);
    await screen.findByRole("option", { name: "Company A" });
    fireEvent.change(screen.getByRole("combobox", { name: "Empresa" }), {
      target: { value: "company-a" },
    });
    await screen.findByTitle("Landing A · artefato isolado");
    fireEvent.change(
      screen.getByRole("combobox", { name: "Status do protótipo" }),
      { target: { value: "archived" } },
    );
    expect(
      screen.getByText("Nenhum protótipo arquivado disponível."),
    ).toBeInTheDocument();
  });

  it("restores an archived Prototype selected by a direct URL", async () => {
    history.replaceState(
      {},
      "",
      "/local?company_id=company-a&project_id=project-a&artifact=prototype%3Aarchived-demo",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn((url: RequestInfo | URL) =>
        String(url) === "/api/local-preview"
          ? response(catalog)
          : response(detail("a".repeat(64), catalog.projects[0].artifacts)),
      ),
    );
    render(<LocalArtifactPreview />);
    expect(
      await screen.findByRole("button", { name: "Archived Prototype" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Status do protótipo" }),
    ).toHaveValue("archived");
    expect(screen.getByText("PROTÓTIPO · ARQUIVADO")).toBeInTheDocument();
  });

  it("rejects mismatched URL Company/Project instead of silently selecting a different Project", async () => {
    history.replaceState(
      {},
      "",
      "/local?company_id=company-a&project_id=project-b",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn((url: RequestInfo | URL) =>
        String(url) === "/api/local-preview"
          ? response(catalog)
          : response(detail("a".repeat(64), catalog.projects[0].artifacts)),
      ),
    );
    render(<LocalArtifactPreview />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "não existe no registro local",
    );
    expect(screen.getByText(/Project explicitamente/)).toBeInTheDocument();
    expect(screen.queryByText("Project A")).not.toBeInTheDocument();
    expect(
      screen.queryByTitle("Landing A · artefato isolado"),
    ).not.toBeInTheDocument();
  });

  it("isolates late successes and errors across five alternating selections in two batches", async () => {
    const requests: {
      signal: AbortSignal;
      resolve: (value: Response) => void;
      reject: (error: Error) => void;
    }[] = [];
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "/api/local-preview") return response(catalog);
      return new Promise<Response>((resolve, reject) =>
        requests.push({ signal: init?.signal as AbortSignal, resolve, reject }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LocalArtifactPreview />);
    await screen.findByRole("option", { name: "Company A" });
    fireEvent.change(screen.getByRole("combobox", { name: "Empresa" }), {
      target: { value: "company-a" },
    });
    await waitFor(() => expect(requests.length).toBe(1));
    let requestCount = 1;
    for (let batch = 0; batch < 2; batch++) {
      const firstPending = requestCount;
      for (let trigger = 0; trigger < 5; trigger++) {
        const next = batch * 5 + trigger + 1;
        const company = next % 2 ? "company-b" : "company-a";
        fireEvent.change(screen.getByRole("combobox", { name: "Empresa" }), {
          target: { value: company },
        });
        requestCount += 1;
        await waitFor(() => expect(requests.length).toBe(requestCount));
        expect(
          requests[requestCount - 2].signal.aborted,
          `batch=${batch + 1} trigger=${trigger + 1}`,
        ).toBe(true);
      }
      const latest = requests.length - 1;
      const expected = batch === 0 ? catalog.projects[1] : catalog.projects[0];
      const fingerprint =
        expected.company_id === "company-a" ? "a".repeat(64) : "b".repeat(64);
      await act(async () => {
        requests[latest].resolve(
          await response(detail(fingerprint, expected.artifacts)),
        );
      });
      const expectedTitle = `${expected.artifacts[0].name} · artefato isolado`;
      const expectedSrc = `/snapshot/${expected.company_id}/${expected.id}/${fingerprint}/design/landing/index.html`;
      await screen.findByTitle(expectedTitle);
      expect(screen.getByTitle(expectedTitle)).toHaveAttribute(
        "src",
        expectedSrc,
      );
      expect(
        screen.getByRole("heading", { name: expected.artifacts[0].name }),
      ).toBeInTheDocument();
      const staleStart = batch === 0 ? 0 : firstPending;
      for (let stale = staleStart; stale < latest; stale++) {
        await act(async () => {
          if (stale % 2 === 0)
            requests[stale].reject(new Error("late stale failure"));
          else
            requests[stale].resolve(
              await response(
                detail("f".repeat(64), [
                  {
                    id: "stale",
                    kind: "landing",
                    name: "Stale A",
                    state: "available",
                    entry_point: "stale/index.html",
                  },
                ]),
              ),
            );
          await Promise.resolve();
        });
        expect(screen.getByTitle(expectedTitle)).toHaveAttribute(
          "src",
          expectedSrc,
        );
        expect(
          screen.getByRole("heading", { name: expected.artifacts[0].name }),
        ).toBeInTheDocument();
        expect(
          screen.queryByTitle("Stale A · artefato isolado"),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      }
    }
  });

  it("does not expose registry availability when detail verification returns 503", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: RequestInfo | URL) =>
        String(url) === "/api/local-preview"
          ? response(catalog)
          : Promise.resolve(
              new Response('{"error":"snapshot_integrity_failure"}', {
                status: 503,
              }),
            ),
      ),
    );
    render(<LocalArtifactPreview />);
    await screen.findByRole("option", { name: "Company A" });
    fireEvent.change(screen.getByRole("combobox", { name: "Empresa" }), {
      target: { value: "company-a" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Snapshot local indisponível",
    );
    expect(
      screen.queryByRole("button", { name: "Landing A" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/indisponível até que o snapshot seja verificado/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Snapshot imutável · fingerprint identifica o conteúdo salvo · sem publicação",
      ),
    ).toBeInTheDocument();
  });

  it("keeps pending and invalid saved artifact states non-selectable without a verified snapshot", async () => {
    for (const state of ["pending", "invalid"]) {
      vi.stubGlobal(
        "fetch",
        vi.fn((url: RequestInfo | URL) =>
          String(url) === "/api/local-preview"
            ? response(catalog)
            : response({
                consumer_readiness: "not_ready",
                artifacts: [
                  { id: "landing", kind: "landing", name: "Landing A", state },
                ],
              }),
        ),
      );
      render(<LocalArtifactPreview />);
      await screen.findByRole("option", { name: "Company A" });
      fireEvent.change(screen.getByRole("combobox", { name: "Empresa" }), {
        target: { value: "company-a" },
      });
      await screen.findByText(/não verificado nesta leitura/);
      expect(
        screen.queryByRole("button", { name: "Landing A" }),
      ).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("restores the pinned presentation entry, checks HEAD and renders one sandboxed viewport", async () => {
    const fingerprint = "a".repeat(64);
    history.replaceState({}, "", `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=details&state_id=expanded&fingerprint=${fingerprint}&device=mobile&scale=fit`);
    const requests: { url: string; method: string }[] = [];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, method: init?.method || "GET" });
      if (url === "/api/local-preview") return response(catalog);
      if (url.startsWith("/api/local-preview?")) return response(detail(fingerprint, catalog.projects[0].artifacts));
      return Promise.resolve(new Response(null, { status: 200, headers: { "X-Builder-Snapshot-Fingerprint": fingerprint } }));
    }));

    render(<LocalArtifactPreview />);
    const frame = await screen.findByTitle("Prototype with colliding ID · Details · Expanded");
    expect(frame).toHaveAttribute("src", `/snapshot/company-a/project-a/${fingerprint}/prototypes/demo/details.html?prototype_state=expanded`);
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame).toHaveStyle({ width: "390px", height: "844px" });
    expect(screen.getByRole("combobox", { name: "Protótipo" })).toHaveValue("landing");
    expect(screen.getByRole("combobox", { name: "Ir para tela" })).toHaveValue("details");
    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveValue("expanded");
    expect(screen.getByRole("button", { name: "Mobile" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Ajustar" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(`Snapshot · ${"a".repeat(8)}…`)).toBeInTheDocument();
    expect(screen.getByText("a".repeat(64))).toBeInTheDocument();
    expect(requests).toContainEqual({ url: `/snapshot/company-a/project-a/${fingerprint}/prototypes/demo/details.html?prototype_state=expanded`, method: "HEAD" });
    expect(screen.getAllByTitle("Prototype with colliding ID · Details · Expanded")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Desktop" }));
    expect(new URLSearchParams(location.search).get("device")).toBe("desktop");
    expect(screen.getByTitle("Prototype with colliding ID · Details · Expanded")).toHaveStyle({ width: "1440px", height: "900px" });
    fireEvent.click(screen.getByRole("button", { name: "100%" }));
    expect(new URLSearchParams(location.search).get("scale")).toBe("100");
    expect(screen.getByRole("region", { name: /apresentação/ })).toHaveStyle({ justifyContent: "safe center" });
    fireEvent.change(screen.getByRole("combobox", { name: "Ir para tela" }), { target: { value: "start" } });
    expect(new URLSearchParams(location.search).get("screen_id")).toBe("start");
    expect(new URLSearchParams(location.search).get("state_id")).toBe("initial");
  });

  it("bounds stale fingerprint and failed exact-entry preflight with diagnostics", async () => {
    const current = "a".repeat(64);
    history.replaceState({}, "", `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=start&state_id=initial&fingerprint=${"b".repeat(64)}&device=mobile&scale=fit`);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/local-preview") return response(catalog);
      if (url.startsWith("/api/local-preview?")) return response(detail(current, catalog.projects[0].artifacts));
      if (init?.method === "HEAD") return Promise.resolve(new Response(null, { status: 404 }));
      return response({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LocalArtifactPreview />);
    expect(await screen.findByText(/Snapshot alterado/)).toBeInTheDocument();
    expect(screen.getByLabelText(`Snapshot fingerprint ${"b".repeat(64)}`)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "HEAD")).toBe(false);
    cleanup();

    history.replaceState({}, "", `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=start&state_id=initial&fingerprint=${current}&device=mobile&scale=fit`);
    render(<LocalArtifactPreview />);
    expect(await screen.findByText(/HTML desta entrada não está disponível/)).toBeInTheDocument();
    expect(screen.queryByRole("iframe")).not.toBeInTheDocument();
  });

  it("ignores a late HEAD success for a previously selected Screen", async () => {
    const fingerprint = "a".repeat(64);
    history.replaceState({}, "", `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=start&state_id=initial&fingerprint=${fingerprint}&device=mobile&scale=fit`);
    const pending: ((response: Response) => void)[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/local-preview") return response(catalog);
      if (url.startsWith("/api/local-preview?")) return response(detail(fingerprint, catalog.projects[0].artifacts));
      if (init?.method === "HEAD") return new Promise<Response>((resolve) => pending.push(resolve));
      return response({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LocalArtifactPreview />);
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.change(screen.getByRole("combobox", { name: "Ir para tela" }), { target: { value: "details" } });
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => {
      pending[1](new Response(null, { status: 200, headers: { "X-Builder-Snapshot-Fingerprint": fingerprint } }));
    });
    expect(await screen.findByTitle("Prototype with colliding ID · Details · Collapsed")).toHaveAttribute("src", `/snapshot/company-a/project-a/${fingerprint}/prototypes/demo/details.html?prototype_state=collapsed`);
    await act(async () => {
      pending[0](new Response(null, { status: 200, headers: { "X-Builder-Snapshot-Fingerprint": fingerprint } }));
    });
    expect(screen.getAllByTitle(/Prototype with colliding ID/)).toHaveLength(1);
    expect(screen.getByTitle("Prototype with colliding ID · Details · Collapsed")).toBeInTheDocument();
  });

  it("shows an invalid selection diagnostic without requesting its HTML", async () => {
    const fingerprint = "a".repeat(64);
    history.replaceState({}, "", `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=missing&state_id=missing&fingerprint=${fingerprint}&device=mobile&scale=fit`);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/local-preview") return response(catalog);
      if (url.startsWith("/api/local-preview?")) return response(detail(fingerprint, catalog.projects[0].artifacts));
      if (init?.method === "HEAD") return Promise.resolve(new Response(null, { status: 200, headers: { "X-Builder-Snapshot-Fingerprint": fingerprint } }));
      return response({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LocalArtifactPreview />);
    expect(await screen.findByText(/Seleção inválida/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "HEAD")).toBe(false);
    expect(screen.queryByTitle(/Prototype with colliding ID/)).not.toBeInTheDocument();
  });

  it.each(["device=tablet", "scale=200"])(
    "rejects malformed presentation display choice %s without HEAD",
    async (choice) => {
      const fingerprint = "a".repeat(64);
      const displayChoice = choice === "device=tablet" ? "device=tablet&scale=fit" : "device=mobile&scale=200";
      history.replaceState({}, "", `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=start&state_id=initial&fingerprint=${fingerprint}&${displayChoice}`);
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/local-preview") return response(catalog);
        if (url.startsWith("/api/local-preview?")) return response(detail(fingerprint, catalog.projects[0].artifacts));
        if (init?.method === "HEAD") return Promise.resolve(new Response(null, { status: 200, headers: { "X-Builder-Snapshot-Fingerprint": fingerprint } }));
        return response({});
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<LocalArtifactPreview />);
      expect(await screen.findByText(/Seleção inválida/)).toBeInTheDocument();
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "HEAD")).toBe(false);
      expect(screen.queryByTitle(/Prototype with colliding ID/)).not.toBeInTheDocument();
    },
  );

  it.each(["wrong", "missing"])(
    "rejects a successful HEAD with a %s fingerprint header",
    async (header) => {
      const fingerprint = "a".repeat(64);
      history.replaceState({}, "", `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=start&state_id=initial&fingerprint=${fingerprint}&device=mobile&scale=fit`);
      const headers = header === "wrong"
        ? { "X-Builder-Snapshot-Fingerprint": "b".repeat(64) }
        : undefined;
      const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/local-preview") return response(catalog);
        if (url.startsWith("/api/local-preview?")) return response(detail(fingerprint, catalog.projects[0].artifacts));
        if (init?.method === "HEAD") return Promise.resolve(new Response(null, { status: 200, headers }));
        return response({});
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<LocalArtifactPreview />);
      expect(await screen.findByText(/resposta não corresponde ao fingerprint selecionado/)).toBeInTheDocument();
      expect(screen.queryByTitle(/Prototype with colliding ID/)).not.toBeInTheDocument();
    },
  );

  it("does not reuse an old ready check while a newly selected Screen or State is pending", async () => {
    const fingerprint = "a".repeat(64);
    history.replaceState({}, "", `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=start&state_id=initial&fingerprint=${fingerprint}&device=mobile&scale=fit`);
    const pending: ((response: Response) => void)[] = [];
    let headCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/local-preview") return response(catalog);
      if (url.startsWith("/api/local-preview?")) return response(detail(fingerprint, catalog.projects[0].artifacts));
      if (init?.method === "HEAD") {
        headCount += 1;
        if (headCount === 1) return Promise.resolve(new Response(null, { status: 200, headers: { "X-Builder-Snapshot-Fingerprint": fingerprint } }));
        return new Promise<Response>((resolve) => pending.push(resolve));
      }
      return response({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LocalArtifactPreview />);
    expect(await screen.findByTitle("Prototype with colliding ID · Start · Initial")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Ir para tela" }), { target: { value: "details" } });
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(screen.queryByTitle("Prototype with colliding ID · Start · Initial")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Prototype with colliding ID · Details · Collapsed")).not.toBeInTheDocument();
    await act(async () => pending[0](new Response(null, { status: 200, headers: { "X-Builder-Snapshot-Fingerprint": fingerprint } })));
    expect(await screen.findByTitle("Prototype with colliding ID · Details · Collapsed")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Estado" }), { target: { value: "expanded" } });
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(screen.queryByTitle("Prototype with colliding ID · Details · Collapsed")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Prototype with colliding ID · Details · Expanded")).not.toBeInTheDocument();
    await act(async () => pending[1](new Response(null, { status: 200, headers: { "X-Builder-Snapshot-Fingerprint": fingerprint } })));
    expect(await screen.findByTitle("Prototype with colliding ID · Details · Expanded")).toBeInTheDocument();
  });

  it("keeps Prototype and State selector choices across a presentation refresh", async () => {
    const fingerprint = "a".repeat(64);
    history.replaceState({}, "", `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=start&state_id=initial&fingerprint=${fingerprint}&device=mobile&scale=fit`);
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/local-preview") return response(catalog);
      if (url.startsWith("/api/local-preview?")) return response(detail(fingerprint, catalog.projects[0].artifacts));
      if (init?.method === "HEAD") return Promise.resolve(new Response(null, { status: 200, headers: { "X-Builder-Snapshot-Fingerprint": fingerprint } }));
      return response({});
    }));
    render(<LocalArtifactPreview />);
    await screen.findByTitle("Prototype with colliding ID · Start · Initial");
    fireEvent.change(screen.getByRole("combobox", { name: "Protótipo" }), { target: { value: "archived-demo" } });
    await waitFor(() => expect(new URLSearchParams(location.search).get("prototype_id")).toBe("archived-demo"));
    fireEvent.change(screen.getByRole("combobox", { name: "Protótipo" }), { target: { value: "landing" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Ir para tela" }), { target: { value: "details" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Estado" }), { target: { value: "expanded" } });
    expect(new URLSearchParams(location.search).get("prototype_id")).toBe("landing");
    expect(new URLSearchParams(location.search).get("screen_id")).toBe("details");
    expect(new URLSearchParams(location.search).get("state_id")).toBe("expanded");
    cleanup();
    render(<LocalArtifactPreview />);
    expect(await screen.findByTitle("Prototype with colliding ID · Details · Expanded")).toHaveAttribute("src", `/snapshot/company-a/project-a/${fingerprint}/prototypes/demo/details.html?prototype_state=expanded`);
    expect(screen.getByRole("combobox", { name: "Protótipo" })).toHaveValue("landing");
    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveValue("expanded");
  });

  it("shows the detail-fetch failure instead of remaining in presentation loading", async () => {
    history.replaceState({}, "", `/local?mode=presentation&company_id=company-a&project_id=project-a&artifact=prototype%3Alanding&prototype_id=landing&screen_id=start&state_id=initial&fingerprint=${"a".repeat(64)}&device=mobile&scale=fit`);
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/local-preview") return response(catalog);
      if (url.startsWith("/api/local-preview?")) {
        return Promise.resolve(new Response('{"error":"snapshot_integrity_failure"}', { status: 503 }));
      }
      return Promise.resolve(new Response(null, { status: 200 }));
    }));
    render(<LocalArtifactPreview />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Snapshot local indisponível");
    expect(screen.queryByText("Carregando dados do snapshot…")).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Prototype with colliding ID/)).not.toBeInTheDocument();
  });
});
