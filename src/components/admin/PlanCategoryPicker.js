"use client";
import React, { useState } from "react";
import { categoryKeyFrom } from "../../helpers/adminPlanForm";
import s from "./AdminPlansManager.module.css";
export function PlanCategoryPicker({ catalogue, categoryKey, busy, onBusy, onSelect, onCatalogue, send, reload }) {
    const [mode, setMode] = useState(null);
    const [projectKey, setProjectKey] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const [result, setResult] = useState(null);
    const projects = catalogue.projectCategories.filter(row => row.status !== "archived");
    const categories = catalogue.categories.filter(row => row.status === "active" || row.key === categoryKey);
    const projectLabel = (key) => catalogue.projectCategories.find(row => row.category === key)?.label || key;
    function open(next, key = "") {
        setMode(next);
        setProjectKey(key);
        setError("");
        setResult(null);
    }
    async function selectSaved(key) {
        const current = await reload();
        onCatalogue(current);
        if (!current.categories.some(row => row.key === key && row.status === "active"))
            throw new Error("This category changed. Reload and select an active category.");
        onSelect(key);
        setMode(null);
        setResult(null);
        setName("");
    }
    async function run(action) {
        if (busy)
            return;
        onBusy(true);
        setError("");
        try {
            await action();
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not select the category.");
        }
        finally {
            onBusy(false);
        }
    }
    async function useProject() {
        await run(async () => {
            const next = await send({ target: "category", action: "use_project_category", projectCategoryKey: projectKey });
            if (next.status === "selected" && next.category)
                await selectSaved(next.category.key);
            else
                setResult(next);
        });
    }
    async function createIndependent() {
        await run(async () => {
            const created = await send({ target: "category", creating: true, key: categoryKeyFrom(name), label: name.trim(), linkedProjectCategory: null, status: "active", sortOrder: catalogue.categories.length });
            await selectSaved(created.key);
        });
    }
    return <div className={s.stack}>
    <label className="admin-field"><span>Plan category</span>
      <select aria-label="Plan category" required value={categoryKey} disabled={busy} onChange={event => {
            if (event.target.value.startsWith("project:"))
                open("project", event.target.value.slice(8));
            else {
                onSelect(event.target.value);
                setMode(null);
                setError("");
            }
        }}>
        <option value="">Choose a category</option>
        <optgroup label="Existing plan categories">{categories.map(row => <option key={row.key} value={row.key}>{row.label}{row.status === "archived" ? " (archived)" : ""}{row.linkedProjectCategory ? ` · linked to ${projectLabel(row.linkedProjectCategory)}` : ""}</option>)}</optgroup>
        <optgroup label="Use a project category">{projects.map(row => <option key={row.category} value={`project:${row.category}`}>{row.label}</option>)}</optgroup>
      </select>
    </label>
    <div className="form-actions">
      <button type="button" className="admin-action" disabled={busy || !projects.length} onClick={() => open("project", projects[0]?.category)}>Use project category</button>
      <button type="button" className="admin-action" disabled={busy} onClick={() => open("independent")}>New independent category</button>
    </div>
    {mode === "project" && <fieldset disabled={busy} className={s.box}><legend>Use a project category</legend>
      <label className="admin-field"><span>Project category</span><select aria-label="Project category" value={projectKey} onChange={event => { setProjectKey(event.target.value); setResult(null); setError(""); }}><option value="">Choose a project category</option>{projects.map(row => <option key={row.category} value={row.category}>{row.label}</option>)}</select></label>
      <p className={s.muted}>Reuses a linked plan category. If none exists, confirmation creates one linked category. Opening this choice saves nothing.</p>
      <div className="form-actions"><button type="button" className="admin-button" disabled={!projectKey} onClick={useProject}>Confirm project category</button><button type="button" className="admin-action" onClick={() => { setMode(null); setResult(null); setError(""); }}>Cancel category choice</button></div>
      {result && result.status !== "selected" && <div className={s.stack}>
        <p>{result.status === "archived" ? "Linked categories are archived. Restore one explicitly to use it." : "Several categories link to this project type. Choose the one to use."}</p>
        {(result.categories || []).map(row => <div key={row.key} className={s.inline}><span>{row.label}</span><button type="button" className="admin-action" onClick={() => run(async () => {
                        if (result.status === "archived")
                            await send({ target: "category", key: row.key, status: "active", expectedUpdatedAt: row.updatedAt ?? null });
                        await selectSaved(row.key);
                    })}>{result.status === "archived" ? "Restore and use category" : "Use this category"}</button></div>)}
      </div>}
    </fieldset>}
    {mode === "independent" && <fieldset disabled={busy} className={s.box}><legend>New independent category</legend>
      <label className="admin-field"><span>New category name</span><input maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Online Promotions"/></label>
      <p className={s.muted}>A separate plan/showcase category, with no project category link.</p>
      <div className="form-actions"><button type="button" className="admin-button" disabled={!/^[a-z][a-z0-9_]{2,39}$/.test(categoryKeyFrom(name))} onClick={createIndependent}>Create independent category</button><button type="button" className="admin-action" onClick={() => { setMode(null); setError(""); }}>Cancel category choice</button></div>
    </fieldset>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
