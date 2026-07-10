import type { AgentId, PlaceId, Tick } from "@gss/contracts";

/** Institution patch (subset of InstitutionParams) */
export type PolicyPatch = {
  enforcementStrength?: number;
  contributionReward?: number;
  freeRidePenalty?: number;
  transparency?: boolean;
};

export type VoteValue = "yea" | "nay" | "abstain";
export type ProposalStatus = "open" | "passed" | "rejected" | "expired";

export interface PolicyProposal {
  id: string;
  author: AgentId;
  createdTick: Tick;
  patch: PolicyPatch;
  status: ProposalStatus;
  votes: Record<AgentId, VoteValue>;
  placeId: PlaceId;
  expireTick?: Tick;
  resolvedTick?: Tick;
}

export interface PolicyBoardSnapshot {
  proposals: PolicyProposal[];
  nextId: number;
  assemblyPlaceId: PlaceId;
  /** minimum yeas to pass (default 2 for 3-agent vignette) */
  yeaThreshold: number;
}

export interface VoteResult {
  proposal: PolicyProposal;
  justPassed: boolean;
  justRejected: boolean;
}

/**
 * Mini legislature: propose → vote → pass/reject.
 * Does not apply institution itself — Runtime calls applyInstitution on pass.
 */
export class PolicyBoard {
  private proposals = new Map<string, PolicyProposal>();
  private nextId = 1;
  assemblyPlaceId: PlaceId = "cabin";
  yeaThreshold = 2;

  constructor(opts?: { assemblyPlaceId?: PlaceId; yeaThreshold?: number }) {
    if (opts?.assemblyPlaceId) this.assemblyPlaceId = opts.assemblyPlaceId;
    if (opts?.yeaThreshold !== undefined) this.yeaThreshold = opts.yeaThreshold;
  }

  list(): PolicyProposal[] {
    return [...this.proposals.values()].map((p) => structuredClone(p));
  }

  get(id: string): PolicyProposal | undefined {
    const p = this.proposals.get(id);
    return p ? structuredClone(p) : undefined;
  }

  openProposals(): PolicyProposal[] {
    return this.list().filter((p) => p.status === "open");
  }

  propose(args: {
    author: AgentId;
    tick: Tick;
    patch: PolicyPatch;
    placeId: PlaceId;
    expireTick?: Tick;
  }): PolicyProposal {
    if (args.placeId !== this.assemblyPlaceId) {
      throw new Error("must propose at assembly place");
    }
    if (!patchNonEmpty(args.patch)) {
      throw new Error("empty policy patch");
    }
    const id = `prop-${this.nextId++}`;
    const p: PolicyProposal = {
      id,
      author: args.author,
      createdTick: args.tick,
      patch: { ...args.patch },
      status: "open",
      votes: {},
      placeId: args.placeId,
      expireTick: args.expireTick,
    };
    this.proposals.set(id, p);
    return structuredClone(p);
  }

  vote(args: {
    proposalId: string;
    voter: AgentId;
    vote: VoteValue;
    placeId: PlaceId;
    tick: Tick;
    /** agents present at assembly (for future threshold rules) */
    presentAgents?: AgentId[];
  }): VoteResult {
    const p = this.proposals.get(args.proposalId);
    if (!p) throw new Error(`unknown proposal ${args.proposalId}`);
    if (p.status !== "open") throw new Error("proposal not open");
    if (args.placeId !== p.placeId) {
      throw new Error("must vote at proposal place");
    }
    if (p.votes[args.voter]) {
      throw new Error("already voted");
    }
    p.votes[args.voter] = args.vote;

    let justPassed = false;
    let justRejected = false;
    const yeas = countVotes(p, "yea");
    const nays = countVotes(p, "nay");
    if (yeas >= this.yeaThreshold && yeas > nays) {
      p.status = "passed";
      p.resolvedTick = args.tick;
      justPassed = true;
    } else if (nays >= this.yeaThreshold && nays > yeas) {
      p.status = "rejected";
      p.resolvedTick = args.tick;
      justRejected = true;
    }

    return {
      proposal: structuredClone(p),
      justPassed,
      justRejected,
    };
  }

  expireOpen(tick: Tick): PolicyProposal[] {
    const expired: PolicyProposal[] = [];
    for (const p of this.proposals.values()) {
      if (p.status === "open" && p.expireTick !== undefined && tick > p.expireTick) {
        p.status = "expired";
        p.resolvedTick = tick;
        expired.push(structuredClone(p));
      }
    }
    return expired;
  }

  digest(): string {
    return [...this.proposals.values()]
      .map(
        (p) =>
          `${p.id}:${p.status}:${p.author}:${JSON.stringify(p.patch)}:${Object.keys(p.votes).length}`,
      )
      .sort()
      .join("|");
  }

  snapshot(): PolicyBoardSnapshot {
    return {
      proposals: this.list(),
      nextId: this.nextId,
      assemblyPlaceId: this.assemblyPlaceId,
      yeaThreshold: this.yeaThreshold,
    };
  }

  loadSnapshot(snap: PolicyBoardSnapshot): void {
    this.proposals.clear();
    for (const p of snap.proposals) {
      this.proposals.set(p.id, structuredClone(p));
    }
    this.nextId = snap.nextId;
    this.assemblyPlaceId = snap.assemblyPlaceId;
    this.yeaThreshold = snap.yeaThreshold;
  }

  static fromSnapshot(snap: PolicyBoardSnapshot): PolicyBoard {
    const b = new PolicyBoard({
      assemblyPlaceId: snap.assemblyPlaceId,
      yeaThreshold: snap.yeaThreshold,
    });
    b.loadSnapshot(snap);
    return b;
  }
}

function countVotes(p: PolicyProposal, v: VoteValue): number {
  return Object.values(p.votes).filter((x) => x === v).length;
}

function patchNonEmpty(patch: PolicyPatch): boolean {
  return (
    patch.enforcementStrength !== undefined ||
    patch.contributionReward !== undefined ||
    patch.freeRidePenalty !== undefined ||
    patch.transparency !== undefined
  );
}
