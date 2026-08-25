import { useState, useEffect } from 'react';
import supabase from '../lib/supabase';
import type { Tool } from '../types/directory';

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
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <h1 className="text-3xl font-bold mb-6">StackDirectory</h1>

      {loading ? (
        <p className="text-slate-400">Loading approved tools…</p>
      ) : error ? (
        <div className="border border-red-500/50 bg-red-500/10 rounded-lg p-4 text-red-200 text-sm">
          <p className="font-semibold mb-1">Failed to load tools</p>
          <p>{error}</p>
        </div>
      ) : tools.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => (
            <div
              key={tool.id}
              className="border border-slate-800 rounded-lg p-5 bg-slate-900"
            >
              <h2 className="text-xl font-semibold">{tool.name}</h2>
              <p className="text-slate-400 text-sm mt-1">{tool.tagline}</p>
              <div className="mt-4 flex justify-between items-center text-xs text-slate-500">
                <span>Upvotes: {tool.upvotes}</span>
                <span>{tool.pricing_type}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-slate-400">No approved tools submitted yet.</p>
      )}
    </main>
  );
}