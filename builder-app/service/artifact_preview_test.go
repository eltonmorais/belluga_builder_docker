package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRegisteredPreviewUsesPrivateRegistryAndImmutableAdmittedSnapshot(t *testing.T) {
	if _, err := (&registeredPreview{root: string(filepath.Separator)}).catalog(); err == nil {
		t.Fatal("filesystem root was accepted as local Builder state")
	}
	root := t.TempDir()
	imagePaths := []string{
		"design/landing/assets/lowercase.avif",
		"design/landing/assets/uppercase.AVIF",
		"design/landing/assets/marker.PNG",
		"design/landing/assets/photo.JPG",
		"design/landing/assets/photo.JPEG",
		"design/landing/assets/photo.WEBP",
	}
	files := map[string][]byte{"design/landing/index.html": []byte("<main>trial</main>"), "design/landing/landing.css": []byte("main{color:teal}"), "design/landing/assets/marker.svg": []byte("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"), "project_mandate.md": []byte("# Trial mandate"), "private.txt": []byte("not admitted by artifact record")}
	for _, name := range imagePaths {
		files[name] = []byte("fixture-image")
	}
	artifactFiles := []string{"design/landing/index.html", "design/landing/landing.css", "design/landing/assets/marker.svg", "project_mandate.md"}
	artifactFiles = append(artifactFiles, imagePaths...)
	snapshot := registeredSnapshot{SchemaVersion: "builder-project-snapshot-v1", ProjectID: "trial-project", CompanyID: "trial-company", ObservedAt: "2026-10-07T00:00:00Z", Files: files, Artifacts: []registeredArtifact{{ID: "landing", Kind: "landing", Name: "Landing", State: "available", Entry: "design/landing/index.html", Files: artifactFiles}}, Observations: map[string]json.RawMessage{}}
	snapshotBytes, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(snapshotBytes)
	fingerprint := hex.EncodeToString(hash[:])
	if err := os.MkdirAll(filepath.Join(root, "snapshots"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "snapshots", fingerprint+".json"), snapshotBytes, 0o444); err != nil {
		t.Fatal(err)
	}
	registry := persistedRegistration{SchemaVersion: "builder-project-registry-v1", Companies: map[string]registeredCompany{"trial-company": {ID: "trial-company", Name: "Trial Company"}}, Projects: map[string]persistedProject{"trial-project": {registeredProject: registeredProject{ID: "trial-project", Name: "Trial Project", CompanyID: "trial-company", PreparationState: "ready", SnapshotFingerprint: fingerprint, Artifacts: snapshot.Artifacts}, Binding: &persistedBinding{WorkspaceRoot: "/tmp/trial", ProjectRoot: "project", FoundationRoot: "project/foundation"}}}, Preferences: map[string]persistedPreference{}}
	registryBytes, err := json.Marshal(registry)
	if err != nil {
		t.Fatal(err)
	}
	registryPath := filepath.Join(root, "registry.json")
	if err := os.WriteFile(registryPath, registryBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	consumer := &registeredPreview{root: root}
	api := httptest.NewRecorder()
	consumer.apiHandler(api, httptest.NewRequest("GET", "/api/local-preview?company_id=trial-company&project_id=trial-project", nil))
	if api.Code != 200 || !strings.Contains(api.Body.String(), fingerprint) || strings.Contains(api.Body.String(), root) {
		t.Fatalf("API response=%d %s", api.Code, api.Body.String())
	}
	before, err := os.ReadFile(registryPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(registryBytes) {
		t.Fatal("read-only API changed registry")
	}
	badRegistry := registry
	badRegistry.Projects = map[string]persistedProject{"wrong-key": registry.Projects["trial-project"]}
	badBytes, err := json.Marshal(badRegistry)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(registryPath, badBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	corrupt := httptest.NewRecorder()
	consumer.apiHandler(corrupt, httptest.NewRequest("GET", "/api/local-preview", nil))
	if corrupt.Code != 503 {
		t.Fatalf("mismatched registry map key was selectable: %d %s", corrupt.Code, corrupt.Body.String())
	}
	duplicateRegistry := []byte(`{"schema_version":"builder-project-registry-v1","schema_version":"builder-project-registry-v1","companies":{},"projects":{}}`)
	if err := os.WriteFile(registryPath, duplicateRegistry, 0o600); err != nil {
		t.Fatal(err)
	}
	duplicate := httptest.NewRecorder()
	consumer.apiHandler(duplicate, httptest.NewRequest("GET", "/api/local-preview", nil))
	if duplicate.Code != 503 {
		t.Fatalf("duplicate registry keys status=%d", duplicate.Code)
	}
	if err := os.WriteFile(registryPath, registryBytes, 0o600); err != nil {
		t.Fatal(err)
	}
	page := httptest.NewRecorder()
	consumer.artifactHandler(page, httptest.NewRequest("GET", "/snapshot/trial-company/trial-project/"+fingerprint+"/design/landing/index.html", nil))
	if page.Code != 200 || page.Body.String() != "<main>trial</main>" || page.Header().Get("X-Builder-Snapshot-Fingerprint") != fingerprint {
		t.Fatalf("artifact response=%d %s", page.Code, page.Body.String())
	}
	asset := httptest.NewRecorder()
	consumer.artifactHandler(asset, httptest.NewRequest("GET", "/snapshot/trial-company/trial-project/"+fingerprint+"/design/landing/landing.css", nil))
	if asset.Code != 200 || asset.Header().Get("Content-Type") != "text/css; charset=utf-8" {
		t.Fatalf("relative asset response=%d type=%s", asset.Code, asset.Header().Get("Content-Type"))
	}
	svg := httptest.NewRecorder()
	consumer.artifactHandler(svg, httptest.NewRequest("GET", "/snapshot/trial-company/trial-project/"+fingerprint+"/design/landing/assets/marker.svg", nil))
	if svg.Code != 200 || svg.Header().Get("Content-Type") != "image/svg+xml" || !strings.Contains(svg.Header().Get("Content-Security-Policy"), "sandbox") {
		t.Fatalf("SVG response=%d type=%s csp=%s", svg.Code, svg.Header().Get("Content-Type"), svg.Header().Get("Content-Security-Policy"))
	}
	for _, image := range []struct{ path, contentType string }{
		{"design/landing/assets/lowercase.avif", "image/avif"},
		{"design/landing/assets/uppercase.AVIF", "image/avif"},
		{"design/landing/assets/marker.PNG", "image/png"},
		{"design/landing/assets/photo.JPG", "image/jpeg"},
		{"design/landing/assets/photo.JPEG", "image/jpeg"},
		{"design/landing/assets/photo.WEBP", "image/webp"},
	} {
		response := httptest.NewRecorder()
		consumer.artifactHandler(response, httptest.NewRequest("GET", "/snapshot/trial-company/trial-project/"+fingerprint+"/"+image.path, nil))
		if response.Code != 200 || response.Header().Get("Content-Type") != image.contentType {
			t.Errorf("image %s response=%d content-type=%s; want %s", image.path, response.Code, response.Header().Get("Content-Type"), image.contentType)
		}
	}
	evidence := httptest.NewRecorder()
	consumer.artifactHandler(evidence, httptest.NewRequest("GET", "/snapshot/trial-company/trial-project/"+fingerprint+"/project_mandate.md", nil))
	if evidence.Code != 200 || !strings.Contains(evidence.Header().Get("Content-Security-Policy"), "frame-ancestors 'self'") || !strings.Contains(evidence.Header().Get("Content-Security-Policy"), "sandbox") {
		t.Fatalf("relative evidence response=%d csp=%s", evidence.Code, evidence.Header().Get("Content-Security-Policy"))
	}
	for _, request := range []struct{ name, method, path string }{
		{"traversal", "GET", "/snapshot/trial-company/trial-project/" + fingerprint + "/../../etc/passwd"},
		{"mismatched company", "GET", "/snapshot/other-company/trial-project/" + fingerprint + "/design/landing/index.html"},
		{"unadmitted file present in snapshot", "GET", "/snapshot/trial-company/trial-project/" + fingerprint + "/private.txt"},
		{"write method", "POST", "/snapshot/trial-company/trial-project/" + fingerprint + "/design/landing/index.html"},
	} {
		denied := httptest.NewRecorder()
		consumer.artifactHandler(denied, httptest.NewRequest(request.method, request.path, nil))
		if denied.Code != 404 {
			t.Fatalf("%s status=%d body=%s", request.name, denied.Code, denied.Body.String())
		}
	}
	// A digest-mismatched immutable payload must fail closed.
	if err := os.Chmod(filepath.Join(root, "snapshots", fingerprint+".json"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "snapshots", fingerprint+".json"), append(snapshotBytes, ' '), 0o600); err != nil {
		t.Fatal(err)
	}
	tampered := httptest.NewRecorder()
	consumer.artifactHandler(tampered, httptest.NewRequest("GET", "/snapshot/trial-company/trial-project/"+fingerprint+"/design/landing/index.html", nil))
	if tampered.Code != 404 {
		t.Fatalf("tampered snapshot status=%d", tampered.Code)
	}
	if err := os.WriteFile(filepath.Join(root, "snapshots", fingerprint+".json"), snapshotBytes, 0o444); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(filepath.Join(root, "snapshots"), filepath.Join(root, "snapshots-real")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(root, "snapshots-real"), filepath.Join(root, "snapshots")); err != nil {
		t.Fatal(err)
	}
	symlinked := httptest.NewRecorder()
	consumer.artifactHandler(symlinked, httptest.NewRequest("GET", "/snapshot/trial-company/trial-project/"+fingerprint+"/design/landing/index.html", nil))
	if symlinked.Code != 404 {
		t.Fatalf("symlinked snapshot component status=%d", symlinked.Code)
	}
}

func TestRegisteredPreviewRejectsPrivatePrototypeRelatedFromSnapshot(t *testing.T) {
	root := t.TempDir()
	secret := []byte("PRIVATE_SHOULD_NOT_BE_SERVED")
	manifest := []byte(`{"schema_version":"1","related":[{"kind":"documentation","path":".env"}]}`)
	snapshot := registeredSnapshot{SchemaVersion: "builder-project-snapshot-v1", ProjectID: "trial-project", CompanyID: "trial-company", ObservedAt: "2026-10-07T00:00:00Z", Files: map[string][]byte{"prototypes/demo/prototype.json": manifest, "prototypes/demo/index.html": []byte("<main>fixture</main>"), ".env": secret}, Artifacts: []registeredArtifact{{ID: "demo", Kind: "prototype", Name: "Disposable Prototype", State: "available", Entry: "prototypes/demo/index.html", Files: []string{"prototypes/demo/prototype.json", "prototypes/demo/index.html", ".env"}}}, Observations: map[string]json.RawMessage{}}
	snapshotBytes, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(snapshotBytes)
	fingerprint := hex.EncodeToString(digest[:])
	if err := os.MkdirAll(filepath.Join(root, "snapshots"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "snapshots", fingerprint+".json"), snapshotBytes, 0o444); err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	(&registeredPreview{root: root}).artifactHandler(response, httptest.NewRequest("GET", "/snapshot/trial-company/trial-project/"+fingerprint+"/.env", nil))
	if response.Code != 404 || strings.Contains(response.Body.String(), string(secret)) {
		t.Fatalf("private Related bytes were served: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestRegisteredPreviewReturnsTeachForAvailablePrototypeWithLegacyStatusSchema(t *testing.T) {
	root := t.TempDir()
	manifest := []byte(`{"schema_version":"1","id":"demo","entry_point":"index.html","related":[]}`)
	snapshot := registeredSnapshot{
		SchemaVersion: "builder-project-snapshot-v1",
		ProjectID:     "trial-project",
		CompanyID:     "trial-company",
		ObservedAt:    "2026-10-07T00:00:00Z",
		Files: map[string][]byte{
			"prototypes/demo/prototype.json": manifest,
			"prototypes/demo/index.html":     []byte("<main>legacy prototype</main>"),
		},
		Artifacts:    []registeredArtifact{{ID: "demo", Kind: "prototype", Name: "Demo", State: "available", Entry: "prototypes/demo/index.html", Files: []string{"prototypes/demo/prototype.json", "prototypes/demo/index.html"}}},
		Observations: map[string]json.RawMessage{"prototype_status": json.RawMessage(`{"schema_version":"1","project_id":"trial-project","target":"prototypes","outcome":"go","items":[{"id":"demo","screens":[{"id":"start","path":"index.html"}]}]}`)},
	}
	snapshotBytes, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(snapshotBytes)
	fingerprint := hex.EncodeToString(hash[:])
	if err := os.MkdirAll(filepath.Join(root, "snapshots"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "snapshots", fingerprint+".json"), snapshotBytes, 0o444); err != nil {
		t.Fatal(err)
	}
	registry := persistedRegistration{SchemaVersion: "builder-project-registry-v1", Companies: map[string]registeredCompany{"trial-company": {ID: "trial-company", Name: "Trial Company"}}, Projects: map[string]persistedProject{"trial-project": {registeredProject: registeredProject{ID: "trial-project", Name: "Trial Project", CompanyID: "trial-company", PreparationState: "ready", SnapshotFingerprint: fingerprint, Artifacts: snapshot.Artifacts}, Binding: &persistedBinding{WorkspaceRoot: "/tmp/trial", ProjectRoot: "project", FoundationRoot: "project/foundation"}}}, Preferences: map[string]persistedPreference{}}
	registryBytes, err := json.Marshal(registry)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "registry.json"), registryBytes, 0o600); err != nil {
		t.Fatal(err)
	}

	response := httptest.NewRecorder()
	(&registeredPreview{root: root}).apiHandler(response, httptest.NewRequest("GET", "/api/local-preview?company_id=trial-company&project_id=trial-project", nil))
	var body struct {
		ConsumerReadiness string `json:"consumer_readiness"`
		Diagnostic        string `json:"diagnostic"`
		NextAction        string `json:"next_action"`
	}
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &body) != nil || body.ConsumerReadiness != "not_ready" || !strings.Contains(body.Diagnostic, "unsupported schema") || !strings.Contains(body.NextAction, "TEACH") || strings.Contains(response.Body.String(), fingerprint) {
		t.Fatalf("legacy Prototype status was served as ready: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestPrototypeStatusRequiresViewerArrays(t *testing.T) {
	base := registeredSnapshot{
		ProjectID: "trial-project",
		Files: map[string][]byte{
			"prototypes/demo/prototype.json": []byte(`{"schema_version":"2","id":"demo"}`),
		},
		Artifacts: []registeredArtifact{{ID: "demo", Kind: "prototype", State: "available", Entry: "prototypes/demo/start.html"}},
	}
	observation := `{"schema_version":"2","project_id":"trial-project","target":"prototypes","authority_scope":"local_structure_only","outcome":"go","items":[{"id":"demo","root":"prototypes/demo","entry_point":"start.html","screens":[{"id":"start","path":"start.html","default_state_id":"default","states":[{"id":"default","approved_references":[]}]}],"transitions":[]}]}`
	base.Observations = map[string]json.RawMessage{"prototype_status": json.RawMessage(observation)}
	if !validPrototypeStatusObservation(base) {
		t.Fatal("complete v2 status was rejected")
	}
	for _, tc := range []struct {
		name string
		old  string
		new  string
	}{
		{"missing transitions", `,"transitions":[]`, ""},
		{"missing approved references", `,"approved_references":[]`, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			changed := base
			changed.Observations = map[string]json.RawMessage{"prototype_status": json.RawMessage(strings.Replace(observation, tc.old, tc.new, 1))}
			if validPrototypeStatusObservation(changed) {
				t.Fatal("viewer-required array was accepted when absent")
			}
		})
	}
}
