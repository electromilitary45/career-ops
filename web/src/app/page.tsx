"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Job = {
  id: string;
  company: string;
  title: string;
  url: string;
  source: string;
};

type Stats = {
  total: number;
  viewed: number;
  sources: number;
};

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

export default function Home() {
  const [stats, setStats] = useState<Stats>({ total: 0, viewed: 0, sources: 0 });
  const [recent, setRecent] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const date = todayKey();

        // Fetch all jobs for today
        const q = query(
          collection(db, "jobs"),
          where("date", "==", date),
          orderBy("scrapedAt", "desc")
        );
        const snap = await getDocs(q);
        const jobs = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Job[];

        const viewedCount = jobs.filter((j) => (j as unknown as { viewed: boolean }).viewed).length;
        const sources = new Set(jobs.map((j) => j.source)).size;

        setStats({ total: jobs.length, viewed: viewedCount, sources });
        setRecent(jobs.slice(0, 5));
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-20 pb-16">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-xl font-bold">
            J
          </div>
          <span className="text-sm text-gray-400">JobTracker CR</span>
        </div>

        <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
          Ofertas de empleo tech
          <br />
          <span className="text-blue-400">en Costa Rica</span>
        </h1>

        <p className="text-lg text-gray-400 mb-8 max-w-xl">
          Scraping automático de +200 bolsas de empleo. Actualizado cada 20 minutos.
          Gratis y open source.
        </p>

        <div className="flex gap-4">
          <Link
            href="/jobs"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
          >
            Ver ofertas →
          </Link>
          <a
            href="https://github.com/electromilitary45/career-ops"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 border border-gray-700 hover:border-gray-500 rounded-lg font-medium transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-3 gap-4 mb-12">
          <div className="bg-gray-800/50 rounded-xl p-6 text-center">
            <div className="text-3xl font-bold text-white">
              {loading ? "—" : stats.total}
            </div>
            <div className="text-sm text-gray-400 mt-1">Ofertas hoy</div>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-6 text-center">
            <div className="text-3xl font-bold text-green-400">
              {loading ? "—" : stats.total - stats.viewed}
            </div>
            <div className="text-sm text-gray-400 mt-1">Sin ver</div>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-6 text-center">
            <div className="text-3xl font-bold text-blue-400">
              {loading ? "—" : stats.sources}
            </div>
            <div className="text-sm text-gray-400 mt-1">Fuentes</div>
          </div>
        </div>

        {/* Recent jobs preview */}
        {!loading && recent.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4 text-gray-300">Últimas ofertas</h2>
            <div className="space-y-2">
              {recent.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between bg-gray-800/30 rounded-lg px-4 py-3"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-white">{job.company}</span>
                    <span className="text-gray-500 mx-2">—</span>
                    <span className="text-gray-400 truncate">{job.title}</span>
                  </div>
                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <span className="text-xs text-gray-500">{job.source}</span>
                    {job.url && (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Link href="/jobs" className="text-blue-400 hover:text-blue-300 text-sm">
                Ver todas las ofertas →
              </Link>
            </div>
          </div>
        )}

        {!loading && recent.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>Aún no hay ofertas de hoy.</p>
            <p className="text-sm mt-1">El scraping se ejecuta automáticamente en la VM de OCI.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-800 py-8">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-sm text-gray-500">
          <span>JobTracker CR — proyecto personal</span>
          <a
            href="https://github.com/electromilitary45"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-300"
          >
            @electromilitary45
          </a>
        </div>
      </div>
    </div>
  );
}
