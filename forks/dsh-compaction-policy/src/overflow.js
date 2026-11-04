import { isDeepStrictEqual } from 'node:util';

// Retry only a completed failed summary transaction, never an uncertain commit.
export async function compactWithOverflowFallback({ session, start, end, signal, meter, pairing, compact, attempt }) {
  let lastEnd = end;
  for (;;) {
    signal?.throwIfAborted();
    const nodes = [...session.surface.nodes];
    const first = nodes.indexOf(start);
    const last = nodes.indexOf(lastEnd);
    if (first < 0 || last < first) return compact(start, lastEnd);
    const beforeSeq = session.seq;
    let header, priced, toolHistory, surface;
    try {
      surface = { nodes, replaceGeneration: session.surface.replaceGeneration, contentGeneration: session.surface.contentGeneration };
      header = structuredClone(session.requestHeader());
      const { logRevision, ...stableMeasurement } = meter.measure(session);
      priced = structuredClone(stableMeasurement);
      toolHistory = typeof session.toolHistory === 'function' ? structuredClone(session.toolHistory()) : undefined;
    } catch (snapshotError) {
      // An unavailable snapshot disables fallback without changing the host operation.
      return compact(start, lastEnd);
    }
    attempt.error = undefined;
    try {
      return await compact(start, lastEnd);
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError' || error?.code !== 'CONTEXT_WINDOW_EXCEEDED'
        || attempt.error !== error) throw error;
      signal?.throwIfAborted();
      let next;
      try {
        const events = [];
        for (let seq = beforeSeq; seq < session.seq; seq++) events.push(session.eventAt(seq));
        const starts = events.filter(event => event?.type === 'compaction/start');
        const ends = events.filter(event => event?.type === 'compaction/end');
        const opened = starts[0];
        const { logRevision, ...stableMeasurement } = meter.measure(session);
        if (starts.length !== 1 || ends.length !== 1 || !opened?.data?.compactionId
          || ends[0].data?.compactionId !== opened.data.compactionId || !ends[0].data?.error
          || events.some(event => event?.type === 'compaction/summary')
          || !isDeepStrictEqual(surface, { nodes: session.surface.nodes, replaceGeneration: session.surface.replaceGeneration,
            contentGeneration: session.surface.contentGeneration })
          || !isDeepStrictEqual(header, session.requestHeader())
          || !isDeepStrictEqual(priced, stableMeasurement)
          || !isDeepStrictEqual(toolHistory, typeof session.toolHistory === 'function' ? session.toolHistory() : undefined)) throw error;
        next = Math.floor((first + last - 1) / 2);
        while (next >= first && !pairing.after(session, nodes[next])) next--;
        if (next < first || !pairing.before(session, start)) throw error;
      } catch (snapshotError) {
        // Preserve the original summary failure if the retry snapshot is unavailable.
        throw error;
      }
      lastEnd = nodes[next];
    }
  }
}
