'use client';

import { useMemo, useState } from 'react';
import { useBaseTrading } from '@/hooks/use-base-trading';
import { useGenericContractTrading, type GenericContractKind } from '@/hooks/use-generic-contract-trading';
import { useDerivWSContext } from '@/components/custom/deriv-ws-provider';
import { useLogoSrc } from '@/components/custom/logo-src-provider';
import { LiveAccumulator } from './live-accumulator';
import { BarChart3, Bot, CircleHelp, FileText, History, LayoutDashboard, LineChart, LogIn, Menu, Settings, ShieldCheck, Wallet, X, Zap } from 'lucide-react';

const nav = [
  ['Dashboard', 'dashboard', LayoutDashboard], ['Manual Trader', 'manual', Zap], ['Over / Under', 'overunder', LineChart],
  ['Even / Odd', 'evenodd', BarChart3], ['Rise / Fall', 'risefall', LineChart], ['Digits 0–9', 'digits', BarChart3],
  ['Accumulator', 'accumulator', Zap], ['Bulk Trader', 'bulk', Zap], ['Portfolio', 'portfolio', Wallet],
  ['Transactions', 'transactions', History], ['Reports', 'reports', FileText], ['Bots', 'bots', Bot],
  ['Analysis', 'analysis', LineChart], ['Settings', 'settings', Settings], ['Support', 'support', CircleHelp],
] as const;
type Page = typeof nav[number][1];

function MiniChart({ prices }: { prices: number[] }) {
  const points = useMemo(() => {
    const p = prices.slice(-80);
    if (p.length < 2) return '';
    const min = Math.min(...p), max = Math.max(...p), range = max - min || 1;
    return p.map((v, i) => `${(i / (p.length - 1)) * 100},${94 - ((v - min) / range) * 82}`).join(' ');
  }, [prices]);
  return <div className="h-[340px] w-full overflow-hidden rounded-xl border border-white/10 bg-[#0b1018]">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
      {[20, 40, 60, 80].map(y => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="white" strokeOpacity=".06" strokeWidth=".25" />)}
      {points && <polyline points={points} fill="none" stroke="#00d395" strokeWidth=".8" vectorEffect="non-scaling-stroke" />}
    </svg>
  </div>;
}

function DigitAnalysis({ prices }: { prices: number[] }) {
  const counts = Array(10).fill(0) as number[];
  prices.slice(-100).forEach(p => counts[Math.abs(Math.floor(p * 10)) % 10]++);
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const latest = prices.length ? Math.abs(Math.floor(prices[prices.length - 1] * 10)) % 10 : null;
  return <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
    {counts.map((c, d) => {
      const pct = Math.round(c / total * 100);
      const live = latest === d;
      return <div key={d} className={`rounded-xl border p-2 text-center transition ${live ? 'border-emerald-400/60 bg-emerald-400/10 shadow-[0_0_18px_rgba(16,185,129,.15)]' : 'border-white/10 bg-white/[.03]'}`}>
        <div className="relative mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-lg font-bold">
          {d}{live && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-ping rounded-full bg-emerald-400" />}
        </div>
        <div className="text-xs text-white/55">{pct}%</div>
        <div className="mt-1 h-1 rounded bg-white/10"><div className="h-full rounded bg-emerald-400 transition-all" style={{ width: `${Math.max(pct, 3)}%` }} /></div>
      </div>;
    })}
  </div>;
}

function GenericTradePanel({ trading, page, currency, isConnected }: { trading: ReturnType<typeof useBaseTrading>; page: Page; currency: string; isConnected: boolean }) {
  const [stake, setStake] = useState('10');
  const [duration, setDuration] = useState('5');
  const [barrier, setBarrier] = useState('5');
  const [kind, setKind] = useState<GenericContractKind>(page === 'risefall' ? 'CALL' : page === 'evenodd' ? 'DIGITEVEN' : page === 'digits' || page === 'overunder' ? 'DIGITOVER' : 'CALL');
  const [message, setMessage] = useState('');
  const digitMode = page === 'digits' || page === 'overunder';
  const proposal = useGenericContractTrading({
    ws: trading.ws,
    isConnected,
    symbol: trading.activeSymbol,
    kind,
    stake: Number(stake),
    currency,
    duration: Math.max(1, Number(duration) || 1),
    durationUnit: 't',
    barrier: Number(barrier),
  });

  const execute = async () => {
    if (!isConnected) { setMessage('Connect your Deriv account first.'); return; }
    if (!proposal.proposal) { setMessage('Waiting for a live Deriv proposal…'); return; }
    setMessage('Submitting trade to Deriv…');
    try {
      await proposal.executeBuy();
      setMessage('Trade submitted to Deriv. Check Portfolio for the live contract.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Trade could not be submitted.');
    }
  };

  return <section className="rounded-xl border border-white/10 bg-[#101620] p-4">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><div className="font-semibold">Live {page === 'manual' ? 'Manual' : 'Contract'} Trader</div><div className="text-xs text-white/40">Quotes, proposals and execution are supplied by Deriv.</div></div>
      <div className={`rounded-full px-3 py-1 text-[10px] font-bold ${proposal.proposal ? 'bg-emerald-400/10 text-emerald-400' : 'bg-white/5 text-white/45'}`}>{proposal.proposal ? 'PROPOSAL LIVE' : 'WAITING FOR PROPOSAL'}</div>
    </div>
    <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
      <div><MiniChart prices={trading.prices}/><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-lg bg-white/[.03] p-3"><div className="text-[10px] text-white/40">MARKET</div><div className="mt-1 text-sm font-semibold">{trading.activeSymbol?.display_name ?? '—'}</div></div><div className="rounded-lg bg-white/[.03] p-3"><div className="text-[10px] text-white/40">TICK</div><div className="mt-1 text-sm font-semibold">{trading.currentTick?.quote ?? '—'}</div></div><div className="rounded-lg bg-white/[.03] p-3"><div className="text-[10px] text-white/40">STAKE</div><div className="mt-1 text-sm font-semibold">{stake} {currency}</div></div><div className="rounded-lg bg-white/[.03] p-3"><div className="text-[10px] text-white/40">ASK</div><div className="mt-1 text-sm font-semibold">{proposal.proposal?.ask_price ?? '—'}</div></div></div></div>
      <div className="rounded-xl border border-white/10 bg-[#0b1018] p-4">
        <label className="mb-3 block text-xs text-white/45">Market<select value={trading.activeSymbol?.underlying_symbol ?? ''} onChange={e => trading.selectSymbol(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#111722] p-3 text-sm text-white">{trading.symbols.map(s => <option key={s.underlying_symbol} value={s.underlying_symbol}>{s.display_name}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-white/45">Stake<input value={stake} onChange={e => setStake(e.target.value)} type="number" min="0.35" step="0.01" className="mt-1 w-full rounded-lg border border-white/10 bg-[#111722] p-3 text-sm text-white"/></label>
          <label className="block text-xs text-white/45">Duration<input value={duration} onChange={e => setDuration(e.target.value)} type="number" min="1" className="mt-1 w-full rounded-lg border border-white/10 bg-[#111722] p-3 text-sm text-white"/></label>
        </div>
        <label className="mt-3 block text-xs text-white/45">Contract<select value={kind} onChange={e => setKind(e.target.value as GenericContractKind)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#111722] p-3 text-sm text-white">{page === 'risefall' && <><option value="CALL">Rise</option><option value="PUT">Fall</option></>}{page === 'evenodd' && <><option value="DIGITEVEN">Even</option><option value="DIGITODD">Odd</option></>}{digitMode && <><option value="DIGITOVER">Over</option><option value="DIGITUNDER">Under</option></>}{page === 'manual' && <><option value="CALL">Rise</option><option value="PUT">Fall</option><option value="DIGITEVEN">Even</option><option value="DIGITODD">Odd</option><option value="DIGITOVER">Over</option><option value="DIGITUNDER">Under</option></>}</select></label>
        {digitMode || kind === 'DIGITOVER' || kind === 'DIGITUNDER' ? <label className="mt-3 block text-xs text-white/45">Digit barrier (0–9)<input value={barrier} onChange={e => setBarrier(String(Math.min(9, Math.max(0, Number(e.target.value) || 0))))} type="number" min="0" max="9" className="mt-1 w-full rounded-lg border border-white/10 bg-[#111722] p-3 text-sm text-white"/></label> : null}
        <button disabled={proposal.isBuying || !isConnected} onClick={execute} className="mt-4 w-full rounded-lg bg-emerald-500 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">{proposal.isBuying ? 'SUBMITTING…' : `BUY ${proposal.proposal?.ask_price ? `• ${proposal.proposal.ask_price}` : ''}`}</button>
        {(proposal.proposalError || proposal.buyError || message) && <div className="mt-3 rounded-lg bg-amber-400/10 p-3 text-xs text-amber-200">{message || proposal.proposalError || proposal.buyError}</div>}
        {proposal.buyResult && <div className="mt-3 rounded-lg bg-emerald-400/10 p-3 text-xs text-emerald-300">Deriv returned a successful buy response. Contract ID: {(proposal.buyResult as any)?.contract_id ?? 'created'}</div>}
      </div>
    </div>
  </section>;
}

export function GoonFxTerminal() {
  const { ws, isConnected, isExhausted, auth } = useDerivWSContext();
  const { authState, accounts, activeAccount, login, logout, switchAccount } = auth;
  const trading = useBaseTrading({ ws, isConnected, isExhausted, isAuthenticated: !!auth.wsUrl, onAuthWSFailed: logout, contractTypes: ['ACCU', 'CALL', 'PUT', 'DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD'] });
  const [page, setPage] = useState<Page>('dashboard');
  const [mobile, setMobile] = useState(false);
  const logo = useLogoSrc();
  const price = trading.currentTick?.quote;
  const account = activeAccount as any;
  const balance = account?.balance ?? account?.amount ?? 0;
  const currency = account?.currency ?? 'USD';

  if (page === 'accumulator') return <div className="min-h-dvh bg-[#080c12]"><LiveAccumulator logoSrc={logo} appName="GOON FX" showAppName/><button onClick={() => setPage('dashboard')} className="fixed bottom-5 left-5 z-[100] rounded-lg border border-white/10 bg-[#111722] px-4 py-2 text-sm text-white shadow-xl">← Back to Terminal</button></div>;

  const currentName = nav.find(n => n[1] === page)?.[0] ?? 'Dashboard';
  const tradingPage = ['manual', 'overunder', 'evenodd', 'risefall', 'digits'].includes(page);

  return <div className="min-h-dvh bg-[#080c12] text-white">
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0f17]/95 backdrop-blur"><div className="flex h-16 items-center gap-3 px-4 lg:px-6"><button className="rounded-lg border border-white/10 p-2 lg:hidden" onClick={() => setMobile(!mobile)}>{mobile ? <X size={19}/> : <Menu size={19}/>}</button><div className="flex items-center gap-2 font-black tracking-wide"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-black">GF</div><span>GOON <span className="text-emerald-400">FX</span></span></div><div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex"><span className="ml-6 text-xs text-white/40">LIVE MARKET</span><span className="rounded-md bg-white/[.04] px-3 py-1.5 text-sm">{trading.activeSymbol?.display_name ?? 'Loading market…'}</span><span className="text-sm font-semibold">{price ?? '—'}</span><span className={isConnected ? 'text-emerald-400 text-xs' : 'text-red-400 text-xs'}>{isConnected ? '● Connected' : '● Offline'}</span></div><div className="ml-auto flex items-center gap-2">{authState === 'authenticated' ? <><select value={activeAccount?.loginid ?? ''} onChange={e => switchAccount(e.target.value)} className="max-w-[145px] rounded-lg border border-white/10 bg-[#111722] px-2 py-2 text-xs"><option value={activeAccount?.loginid}>{activeAccount?.loginid ?? 'Account'}</option>{accounts.filter(a => a.loginid !== activeAccount?.loginid).map(a => <option key={a.loginid} value={a.loginid}>{a.loginid}</option>)}</select><div className="hidden rounded-lg border border-white/10 bg-[#111722] px-3 py-1.5 sm:block"><div className="text-[10px] text-white/40">BALANCE</div><div className="text-sm font-bold">{Number(balance).toFixed(2)} {currency}</div></div></> : <button onClick={login} className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-black"><LogIn size={16}/> Connect Deriv</button>}</div></div></header>
    <div className="flex"><aside className={`${mobile ? 'fixed inset-y-16 left-0 z-40 flex' : 'hidden'} w-64 shrink-0 flex-col border-r border-white/10 bg-[#0a0f17] lg:flex`}><div className="p-3"><div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-white/35">Trading</div>{nav.slice(0, 8).map(([label, id, Icon]) => <button key={id} onClick={() => { setPage(id); setMobile(false); }} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${page === id ? 'bg-emerald-500/10 text-emerald-400' : 'text-white/65 hover:bg-white/[.04] hover:text-white'}`}><Icon size={17}/>{label}</button>)}<div className="mb-2 mt-5 px-3 text-[10px] font-bold uppercase tracking-widest text-white/35">Account & Tools</div>{nav.slice(8).map(([label, id, Icon]) => <button key={id} onClick={() => { setPage(id); setMobile(false); }} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${page === id ? 'bg-emerald-500/10 text-emerald-400' : 'text-white/65 hover:bg-white/[.04] hover:text-white'}`}><Icon size={17}/>{label}</button>)}</div>{authState === 'authenticated' && <button onClick={logout} className="m-3 mt-auto rounded-lg border border-white/10 px-3 py-2 text-xs text-white/55 hover:text-white">Disconnect Deriv</button>}</aside>
      <main className="min-w-0 flex-1 p-4 lg:p-6"><div className="mb-5 flex items-end justify-between"><div><div className="text-xs font-semibold uppercase tracking-widest text-emerald-400">GOON FX TERMINAL</div><h1 className="mt-1 text-2xl font-bold">{currentName}</h1></div><div className="hidden items-center gap-2 text-xs text-white/45 md:flex"><ShieldCheck size={15} className="text-emerald-400"/> Third-party Deriv connection</div></div>
      {page === 'dashboard' ? <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Account Balance', authState === 'authenticated' ? `${Number(balance).toFixed(2)} ${currency}` : '—'], ['Current Price', price ?? '—'], ['Connection', isConnected ? 'LIVE' : 'OFFLINE'], ['Open Positions', String(trading.openPositions.length)]].map(([a, b]) => <div key={a} className="rounded-xl border border-white/10 bg-[#101620] p-4"><div className="text-xs text-white/45">{a}</div><div className="mt-2 text-2xl font-bold">{b}</div></div>)}</div><div className="mt-4 grid gap-4 xl:grid-cols-[1fr_330px]"><section className="rounded-xl border border-white/10 bg-[#101620] p-4"><div className="mb-3 flex items-center justify-between"><div><div className="font-semibold">Live Price Chart</div><div className="text-xs text-white/40">{trading.activeSymbol?.display_name ?? 'Market'}</div></div><select value={trading.activeSymbol?.underlying_symbol ?? ''} onChange={e => trading.selectSymbol(e.target.value)} className="rounded-lg border border-white/10 bg-[#0b1018] px-3 py-2 text-xs">{trading.symbols.map(s => <option key={s.underlying_symbol} value={s.underlying_symbol}>{s.display_name}</option>)}</select></div><MiniChart prices={trading.prices}/></section><section className="rounded-xl border border-white/10 bg-[#101620] p-4"><div className="mb-3 font-semibold">Quick Trade</div><div className="space-y-3"><div className="rounded-lg bg-white/[.03] p-3 text-xs text-white/55">Quick actions now use live Deriv proposals. Connect your own account before execution.</div><div className="grid grid-cols-2 gap-2"><button onClick={() => { setPage('risefall'); }} className="rounded-lg bg-emerald-500 py-3 font-bold text-black">RISE</button><button onClick={() => { setPage('risefall'); }} className="rounded-lg bg-red-500 py-3 font-bold">FALL</button></div><button onClick={() => setPage('manual')} className="w-full rounded-lg border border-white/10 py-2.5 text-xs text-white/65">Open Manual Trader</button></div></section></div><section className="mt-4 rounded-xl border border-white/10 bg-[#101620] p-4"><div className="mb-4 flex items-center justify-between"><div><div className="font-semibold">Live Digit Analysis</div><div className="text-xs text-white/40">0–9 frequency from incoming Deriv ticks</div></div><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-400">LIVE</span></div><DigitAnalysis prices={trading.prices}/></section></> : tradingPage ? <GenericTradePanel trading={trading} page={page} currency={currency} isConnected={isConnected}/> : <section className="rounded-xl border border-white/10 bg-[#101620] p-5"><div className="mb-5 grid gap-4 lg:grid-cols-[1fr_320px]"><div><div className="mb-3 font-semibold">{currentName}</div><MiniChart prices={trading.prices}/></div><div className="rounded-xl border border-white/10 bg-[#0b1018] p-4"><div className="mb-4 text-sm font-semibold">Account Tools</div><div className="space-y-3"><div className="rounded-lg bg-white/[.03] p-3 text-xs text-white/55">{page === 'portfolio' ? 'Open positions are synchronized from the authorized Deriv account.' : 'This workspace is connected to the same live Deriv session. Trading pages use real proposals and buys.'}</div><button onClick={() => setPage('manual')} className="w-full rounded-lg bg-emerald-500 py-3 text-sm font-bold text-black">Open Live Trader</button></div></div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{['Live quotes', 'Risk controls', 'Portfolio sync', 'Trade history'].map(x => <div key={x} className="rounded-lg border border-white/10 p-4"><div className="text-xs text-white/45">{x}</div><div className="mt-2 font-semibold">{x === 'Live quotes' && isConnected ? 'Active' : 'Ready'}</div></div>)}</div></section>}
      </main></div></div>;
}
