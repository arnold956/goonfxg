'use client';

import { useEffect, useMemo, useState } from 'react';
import { useBuy } from '@deriv/core';
import type { DerivWS, ActiveSymbol, BuyResult } from '@deriv/core';

export type GenericContractKind = 'CALL' | 'PUT' | 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD';

interface GenericParams {
  ws: DerivWS | null;
  isConnected: boolean;
  symbol: ActiveSymbol | null;
  kind: GenericContractKind;
  stake: number;
  currency: string;
  duration: number;
  durationUnit: 't' | 's' | 'm';
  barrier?: number;
}

export function useGenericContractTrading({
  ws,
  isConnected,
  symbol,
  kind,
  stake,
  currency,
  duration,
  durationUnit,
  barrier,
}: GenericParams) {
  const [proposal, setProposal] = useState<any>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const { buyContract, isBuying, buyResult, buyError, clearBuyResult } = useBuy(ws, isConnected);

  const payload = useMemo(() => {
    if (!symbol || !stake || stake <= 0) return null;
    const base: Record<string, unknown> = {
      proposal: 1,
      amount: stake,
      basis: 'stake',
      contract_type: kind,
      currency,
      underlying_symbol: symbol.underlying_symbol,
      duration,
      duration_unit: durationUnit,
    };
    if (kind === 'DIGITOVER' || kind === 'DIGITUNDER') base.barrier = barrier ?? 5;
    return base;
  }, [symbol, stake, currency, kind, duration, durationUnit, barrier]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    setProposal(null);
    setProposalError(null);
    if (!ws || !isConnected || !payload) return;

    ws.subscribe(payload, (data) => {
      if (cancelled) return;
      const response = data as any;
      if (response.error) {
        setProposalError(response.error.message ?? 'Unable to create proposal');
        setProposal(null);
        return;
      }
      if (response.proposal) setProposal(response.proposal);
    }).then((sub) => {
      if (cancelled) sub.unsubscribe();
      else unsubscribe = sub.unsubscribe;
    }).catch((error: unknown) => {
      if (!cancelled) setProposalError(error instanceof Error ? error.message : 'Unable to create proposal');
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [ws, isConnected, payload]);

  const executeBuy = async () => {
    if (!proposal) return;
    await buyContract(proposal);
  };

  return {
    proposal,
    proposalError,
    executeBuy,
    isBuying,
    buyResult: buyResult as BuyResult | null,
    buyError,
    clearBuyResult,
  };
}
