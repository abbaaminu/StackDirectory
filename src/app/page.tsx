import { useState, useEffect } from 'react';
import supabase from '../lib/supabase';
import type { Tool } from '../types/directory';

const getPricingBadgeColor = (type: string) => {
  switch (type) {
    case 'Free':
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-md text-xs font-semibold';
    case 'Freemium':
      return 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2.5 py-0.5 rounded-md text-xs font-semibold';
    case 'Open Source':
            return 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 px-2.5 py-0.5 rounded-md text-xs font-semibold';
    case 'Paid':
      return 'bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2.5 py-0.5 rounded-md text-xs font-semibold';
    default:
      return 'bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-0.5 rounded-md text-xs font-medium';
  }
};

export default function HomePage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchApprovedTools = async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from('tools')
          .select('*')
          .eq('is_approved', true)
          .order('upvotes', { ascending: false });

        if (error) {
          console.error('Failed to load tools:', error.message);
          setError(error.message);
          return;
        }

        setTools((data as Tool[]) ?? []);
      } catch (err) {
        console.error('Unexpected error fetching tools:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch tools');
      } finally {
        setLoading(false);
      }
    };

    fetchApprovedTools();
  }, []);

    return (
    <main className="relative min-h-screen bg-[#0a0e1a] text-white overflow-x-hidden">
      {/* Top Section Gradient Glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/15 via-slate-950 to-slate-950" />

      <div className="relative max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">StackDirectory</h1>

        {loading ? (
          <p className="text-slate-400">Loading approved tools…</p>
        ) : error ? (
          <div className="border border-red-500/50 bg-red-500/10 rounded-lg p-4 text-red-200 text-sm">
            <p className="font-semibold mb-1">Failed to load tools</p>
            <p>{error}</p>
          </div>
        ) : tools.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
            {tools.map((tool) => (
              <div
                key={tool.id}
                className="bg-slate-900/90 border border-slate-700/80 hover:border-amber-500/80 shadow-lg hover:shadow-amber-500/10 transition-all duration-300 rounded-xl p-5 flex flex-col justify-between"
              >
                <div>
                  <h2 className="text-white font-bold text-lg hover:text-amber-400 transition-colors">
                    {tool.name}
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">{tool.tagline}</p>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                    <span className="bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-0.5 rounded-md text-xs font-medium">
                      {tool.category}
                    </span>
                    <span className={`${getPricingBadgeColor(tool.pricing_type)}`}>
                      {tool.pricing_type}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex justify-between items-center text-xs text-slate-400">
                  <span>
                    Upvotes: <span className="font-semibold text-white">{tool.upvotes}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-400">No approved tools submitted yet.</p>
        )}
      </div>
    </main>
  );
}