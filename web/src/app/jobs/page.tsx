"use client";

import { useState, useEffect, useCallback } from "react";

type Job = {
  id: string;
  company: string;
  title: string;
  url: string;
  location: string;
  description: string;
  source: string;
  date: string;
  scrapedAt: string;
  viewed: boolean;
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [viewedFilter, setViewedFilter] = useState<string>("false");
  const [sourceFilter, setSourceFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date, limit: "200" });
    if (viewedFilter) params.set("viewed", viewedFilter);
    if (sourceFilter) params.set("source", sourceFilter);

    try {
      const res = await fetch(`/api/jobs/daily?${params}`);
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (err) {
      console.error("Failed to fetch jobs:", err);
    } finally {
      setLoading(false);
    }
  }, [date, viewedFilter, sourceFilter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const markViewed = async (ids: string[], viewed: boolean) => {
    try {
      await fetch("/api/jobs/viewed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, viewed }),
      });
      // Update local state
      setJobs((prev) =>
        prev.map((j) => (ids.includes(j.id) ? { ...j, viewed } : j))
      );
      setSelected(new Set());
    } catch (err) {
      console.error("Failed to mark viewed:", err);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === jobs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(jobs.map((j) => j.id)));
    }
  };

  const sources = [...new Set(jobs.map((j) => j.source))].sort();

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">STEM Jobs — Ofertas del Día</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6 items-end">
        <div>
          <label className="block text-sm font-medium mb-1">Fecha</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Vistas</label>
          <select
            value={viewedFilter}
            onChange={(e) => setViewedFilter(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            <option value="false">No vistas</option>
            <option value="true">Vistas</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Fuente</label>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="text-sm text-gray-500">
          {jobs.length} ofertas
          {selected.size > 0 && ` · ${selected.size} seleccionadas`}
        </div>
      </div>

      {/* Actions */}
      {selected.size > 0 && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => markViewed([...selected], true)}
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
          >
            Marcar como vistas ({selected.size})
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-3 py-1.5 border text-sm rounded hover:bg-gray-50"
          >
            Limpiar selección
          </button>
        </div>
      )}

      {/* Job list */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No hay ofertas para esta fecha. ¿Corrió el ingest hoy?
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-2 border-b text-sm font-medium text-gray-500">
            <input
              type="checkbox"
              checked={selected.size === jobs.length && jobs.length > 0}
              onChange={selectAll}
              className="cursor-pointer"
            />
            <span className="w-8">#</span>
            <span className="flex-1">Empresa / Puesto</span>
            <span className="w-32">Ubicación</span>
            <span className="w-24">Fuente</span>
            <span className="w-10">Ver</span>
          </div>
          {jobs.map((job, i) => (
            <div
              key={job.id}
              className={`flex items-center gap-2 py-2 px-2 rounded text-sm ${
                job.viewed ? "opacity-50" : "hover:bg-gray-50"
              } ${selected.has(job.id) ? "bg-blue-50" : ""}`}
            >
              <input
                type="checkbox"
                checked={selected.has(job.id)}
                onChange={() => toggleSelect(job.id)}
                className="cursor-pointer"
              />
              <span className="w-8 text-gray-400">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{job.company}</div>
                <div className="text-gray-600 truncate">{job.title}</div>
              </div>
              <div className="w-32 text-gray-500 truncate">{job.location || "—"}</div>
              <div className="w-24 text-gray-400 text-xs">{job.source}</div>
              <div className="w-10">
                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
