'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDerivWSContext } from '@/components/custom/deriv-ws-provider';
import { useBaseTrading } from '@/hooks/use-base-trading';

function sma(values: number[], period: number) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function rsi(values: number[], period = 14) {
  if (values.length <= period) return null;
  const slice = values.slice(-(period + 1));
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < slice.length; i++) {
    const d = slice[i] - slice[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

type BuyResponse = {
  buy?: {
    contract_id: number;
    buy_price: number | string;
    payout: number | string;
    balance_after: number | string;
    transaction_id: number;
  };
  error?: { code?: string; message?: string };
};

export function GoonFxBot() {
  const { ws, isConnected, isExhausted, auth } = useDerivWSContext();
  const authenticated = !!auth.wsUrl && auth.authState === 'authenticated';
  const trading = useBaseTrading({
    ws,
    isConnected,
    isExhausted,
    isAuthenticated: authenticated,
    onAuthWSFailed: auth.logout,
    contractTypes: ['ACCU'],
  });

  const [stake, setStake] = useState('1');
  const [growthRate, setGrowthRate] = useState(0.01);
  const [auto, setAuto] = useState(false);
  const [armed, setArmed] = useState(false);
  const [maxTrades, setMaxTrades] = useState(5);
  const [cooldown, setCooldown] = useState(20);
  const [tradeCount, setTradeCount] = useState(0);
  const [lastAction, setLastAction] = useState('Waiting for signal');
  const [signal, setSignal] = useState<'BUY' | 'WAIT'>('WAIT');
  const [signalScore, setSignalScore] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [buyResult, setBuyResult] = useState<BuyResponse['buy'] | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const lastTradeRef = useRef(0);

  const prices = trading.prices;
  const rsi14 = useMemo(() => rsi(prices), [prices]);
  const fast = useMemo(() => sma(prices, 5), [prices]);
  const slow = useMemo(() => sma(prices, 14), [prices]);
  const momentum = useMemo(() => {
    if (prices.length < 6) return 0;
    return prices[prices.length - 1] - prices[prices.length - 6];
  }, [prices]);

  const analysis = useMemo(() => {
    let score = 0;
    if (fast !== null && slow !== null) score += fast > slow ? 1 : -1;
    if (momentum > 0) score += 1;
    if (momentum < 0) score -= 1;
    if (rsi14 !== null) {
      if (rsi14 > 50 && rsi14 < 70) score += 1;
      if (rsi14 < 50 && rsi14 > 30) score -= 1;
    }
    return { score, buy: score >= 2 };
  }, [fast, slow, momentum, rsi14]);

  useEffect(() => {
    setSignalScore(analysis.score);
    setSignal(analysis.buy ? 'BUY' : 'WAIT');
  }, [analysis]);

  const tradeParams = useMemo(() => {
    const amount = Number(stake);
    const currency = auth.activeAccount?.currency;
    const symbol = trading.activeSymbol?.underlying_symbol;
    if (!symbol || !currency || !Number.isFinite(amount) || amount <= 0) return null;
    return { amount, currency, symbol, growthRate };
  }, [stake, auth.activeAccount?.currency, trading.activeSymbol, growthRate]);

  const executeTrade = useCallback(async () => {
    if (!ws || !isConnected || !authenticated || !armed || !tradeParams || isExecuting || tradeCount >= maxTrades) return;
    if (Date.now() - lastTradeRef.current < cooldown * 1000) return;

    setIsExecuting(true);
    setBuyError(null);
    setBuyResult(null);
    lastTradeRef.current = Date.now();
    setLastAction(`Submitting live ${trading.activeSymbol?.symbol ?? 'market'} trade…`);

    try {
      // Deriv supports a direct buy request with buy=1 and contract
      // parameters. `price` is the maximum price the account authorizes for
      // this purchase. Using the requested stake as that ceiling avoids a
      // stale proposal-ID dependency while still letting Deriv validate the
      // contract parameters on the authenticated account.
      const result = await ws.send<BuyResponse>({
        buy: 1,
        price: tradeParams.amount,
        parameters: {
          amount: tradeParams.amount,
          basis: 'stake',
          contract_type: 'ACCU',
          currency: tradeParams.currency,
          underlying_symbol: tradeParams.symbol,
          growth_rate: tradeParams.growthRate,
        },
        subscribe: 1,
      });

      if (result.error) {
        throw new Error(result.error.message ?? result.error.code ?? 'Deriv buy failed');
      }
      if (!result.buy?.contract_id) {
        throw new Error('Deriv did not confirm the purchase.');
      }

      setBuyResult(result.buy);
      setTradeCount(c => c + 1);
      setLastAction(`LIVE TRADE EXECUTED — contract ${result.buy.contract_id}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Trade failed';
      setBuyError(message);
      setLastAction(`Trade rejected: ${message}`);
    } finally {
      setIsExecuting(false);
    }
  }, [ws, isConnected, authenticated, armed, tradeParams, isExecuting, tradeCount, maxTrades, cooldown, trading.activeSymbol]);

  useEffect(() => {
    if (!auto || !armed || signal !== 'BUY' || tradeCount >= maxTrades || isExecuting) return;
    void executeTrade();
  }, [auto, armed, signal, tradeCount, maxTrades, isExecuting, executeTrade]);

  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > 24 * 60 * 60 * 1000) {
        setTradeCount(0);
        setStartedAt(Date.now());
      }
    }, 60000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const toggleArmed = () => {
    if (!armed) {
      if (!authenticated) {
        setLastAction('Connect and authorize your Deriv account before live execution');
        return;
      }
      if (!auth.activeAccount?.account_type) {
        setLastAction('No active Deriv account selected');
        return;
      }
      setTradeCount(0);
      setStartedAt(Date.now());
      setLastAction(`LIVE EXECUTION ARMED — ${auth.activeAccount.account_type.toUpperCase()} ACCOUNT`);
    } else {
      setAuto(false);
      setLastAction('Live execution disarmed');
    }
    setArmed(v => !v);
  };

  return (
    <section className="mx-auto mt-4 w-full max-w-7xl px-4 pb-8">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">GOON FX Bot & Analysis</h2>
            <p className="text-sm text-muted-foreground">Live Deriv ticks → analysis → direct execution</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {isConnected ? 'Deriv connected' : 'Disconnected'}
            {auth.activeAccount && <span className="rounded-full border px-2 py-1">{auth.activeAccount.account_type.toUpperCase()} · {auth.activeAccount.currency}</span>}
            <span className="rounded-full border px-2 py-1">{trading.activeSymbol?.symbol ?? '—'}</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">Signal</div><div className="mt-1 text-2xl font-bold">{signal}</div></div>
          <div className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">Score</div><div className="mt-1 text-2xl font-bold">{signalScore}/3</div></div>
          <div className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">RSI (14)</div><div className="mt-1 text-2xl font-bold">{rsi14 === null ? '—' : rsi14.toFixed(1)}</div></div>
          <div className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">Momentum</div><div className="mt-1 text-2xl font-bold">{momentum.toFixed(5)}</div></div>
          <div className="rounded-xl border p-4"><div className="text-xs text-muted-foreground">Trades</div><div className="mt-1 text-2xl font-bold">{tradeCount}/{maxTrades}</div></div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-xl border p-4">
            <h3 className="font-semibold">Market analysis</h3>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span>Fast MA (5)</span><b>{fast?.toFixed(5) ?? '—'}</b></div>
              <div className="flex justify-between"><span>Slow MA (14)</span><b>{slow?.toFixed(5) ?? '—'}</b></div>
              <div className="flex justify-between"><span>Current tick</span><b>{trading.currentTick?.quote ?? '—'}</b></div>
              <div className="flex justify-between"><span>Execution</span><b>DIRECT BUY</b></div>
              <div className="flex justify-between"><span>Status</span><b>{lastAction}</b></div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">The proposal/price negotiation is handled by Deriv's Buy endpoint; GOON FX does not expose proposal IDs.</p>
          </div>

          <div className="rounded-xl border p-4">
            <h3 className="font-semibold">Direct trade execution</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Stake<input value={stake} onChange={e => setStake(e.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" inputMode="decimal" /></label>
              <label className="text-sm">Growth rate<select value={growthRate} onChange={e => setGrowthRate(Number(e.target.value))} className="mt-1 w-full rounded-lg border bg-background px-3 py-2"><option value={0.01}>1%</option><option value={0.02}>2%</option><option value={0.03}>3%</option><option value={0.04}>4%</option><option value={0.05}>5%</option></select></label>
              <label className="text-sm">Max trades/session<input type="number" min="1" max="100" value={maxTrades} onChange={e => setMaxTrades(Math.max(1, Number(e.target.value) || 1))} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" /></label>
              <label className="text-sm">Cooldown (seconds)<input type="number" min="5" value={cooldown} onChange={e => setCooldown(Math.max(5, Number(e.target.value) || 5))} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" /></label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={toggleArmed} className={`rounded-lg px-4 py-2 font-semibold ${armed ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>{armed ? 'DISARM LIVE' : 'ARM LIVE EXECUTION'}</button>
              <button disabled={!armed || signal !== 'BUY' || isExecuting} onClick={() => void executeTrade()} className="rounded-lg border px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50">{isExecuting ? 'EXECUTING…' : 'EXECUTE TRADE'}</button>
              <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={auto} disabled={!armed} onChange={e => setAuto(e.target.checked)} /> Auto bot</label>
            </div>
            {buyResult && <div className="mt-3 rounded-lg border p-3 text-sm">LIVE CONTRACT: <b>{String(buyResult.contract_id)}</b> · Buy price {String(buyResult.buy_price)} · Balance after {String(buyResult.balance_after)}</div>}
            {buyError && <div className="mt-3 rounded-lg border border-red-300 p-3 text-sm text-red-600">{buyError}</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
