import { useState, useEffect } from 'react';
import supabase from '../lib/supabase';
import type { Tool } from '../types/directory';
import { ToolCardSkeleton } from '../components/ToolCard';

const getPricingBadgeColor = (type: string) => {
  switch (type) {
        case 'Free':
          return 'bg-emerald-500/30 text-emerald-200 border border-emerald-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider';
        case 'Freemium':
          return 'bg-cyan-500/30 text-cyan-200 border border-cyan-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider';
        case 'Open Source':
          return 'bg-fuchsia-500/30 text-fuchsia-200 border border-fuchsia-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider';
        case 'Paid':
          return 'bg-purple-500/30 text-purple-200 border border-purple-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider';
        default:
          return 'bg-slate-600 text-white border border-slate-400 px-3 py-1 rounded-full text-xs font-semibold';
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
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto"
            aria-busy="true"
            aria-label="Loading tools"
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <ToolCardSkeleton key={index} />
            ))}
          </div>
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
                className="bg-slate-700/95 border-2 border-slate-500/70 hover:border-amber-400 shadow-xl hover:shadow-[0_0_25px_rgba(245,158,11,0.2)] transition-all duration-300 rounded-2xl p-5 flex flex-col justify-between"
              >
                <div>
                  <h2 className="text-white font-bold text-lg hover:text-amber-300 transition-colors">
                    {tool.name}
                  </h2>
                  <p className="text-slate-300 text-sm mt-1">{tool.tagline}</p>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                    <span className="bg-slate-600 text-white border border-slate-400/70 px-3 py-1 rounded-full text-xs font-semibold">
                      {tool.category}
                    </span>
                    <span className={`${getPricingBadgeColor(tool.pricing_type)}`}>
                      {tool.pricing_type}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-600/60 flex justify-between items-center text-xs text-slate-300">
                  <span>
                    Upvotes: <span className="font-semibold text-white">{tool.upvotes}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-300">No approved tools submitted yet.</p>
        )}
      </div>
    </main>
  );
}