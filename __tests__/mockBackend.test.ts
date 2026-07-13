import { mockBackend } from '../src/services/mockBackend';
import { ChooseFeed, JobOffer, TradieCandidate, Unsubscribe } from '../src/services/backend';
import { Customer, FeeLineItem, Job, Tradie, TradeCategory } from '../src/types';

const AK = { latitude: -36.79, longitude: 174.76 };
let seq = 0;
const email = () => `u${seq++}@test.dev`;

/** Resolve the first emission of a subscription, then unsubscribe. */
function once<T>(sub: (cb: (v: T) => void) => Unsubscribe): Promise<T> {
  return new Promise((resolve) => {
    let unsub: Unsubscribe | undefined;
    unsub = sub((v) => {
      resolve(v);
      if (unsub) unsub();
    });
  });
}

async function newCustomer(): Promise<Customer> {
  return mockBackend.registerCustomer({ firstName: 'C', lastName: 'D', email: email(), password: 'x' });
}

async function readyTradie(
  opts: { trade?: TradeCategory; status?: Tradie['status']; secondaryTrades?: TradeCategory[] } = {},
): Promise<Tradie> {
  const t = await mockBackend.registerTradie({
    firstName: 'T',
    lastName: 'R',
    email: email(),
    password: 'x',
    businessName: 'Biz',
    yearsExperience: 5,
    primaryTrade: opts.trade ?? 'electrician',
    secondaryTrades: opts.secondaryTrades ?? [],
    qualifications: [],
    serviceRadiusKm: 20,
  });
  await mockBackend.setApproval(t.id, 'approved');
  await mockBackend.setTradieStatus(t.id, opts.status ?? 'available');
  await mockBackend.setTradieLocation(t.id, AK);
  await mockBackend.setTradieRateCard(t.id, { hourlyRateCents: 9000 });
  return (await mockBackend.getTradie(t.id))!;
}

function job(customer: Customer, extra: Record<string, unknown> = {}) {
  return mockBackend.createJob(
    { id: customer.id, name: 'C D' },
    {
      trade: 'electrician',
      description: 'Power is out.',
      photos: [],
      location: { address: '1 Test St', ...AK },
      urgency: 'now',
      ...extra,
    },
  );
}

beforeEach(async () => {
  await mockBackend.resetDemoData();
});

describe('auto dispatch', () => {
  it('snapshots an available matching tradie into the candidate pool', async () => {
    const cust = await newCustomer();
    const tr = await readyTradie();
    const j = await job(cust);
    expect(j.assignmentMode).toBe('auto');
    expect(j.dispatch?.candidateIds).toContain(tr.id);
  });

  it('excludes offline and payment-held tradies', async () => {
    const cust = await newCustomer();
    const offline = await readyTradie({ status: 'offline' });
    const held = await readyTradie();
    await mockBackend.setPaymentHold(held.id, true);
    const j = await job(cust);
    expect(j.dispatch?.candidateIds).not.toContain(offline.id);
    expect(j.dispatch?.candidateIds).not.toContain(held.id);
  });

  it('first tradie to accept wins; a later accept is rejected', async () => {
    const cust = await newCustomer();
    const t1 = await readyTradie();
    const t2 = await readyTradie();
    const j = await job(cust);

    const accepted = await mockBackend.acceptJob(j.id, t1.id);
    expect(accepted.status).toBe('confirmed'); // auto-assign: accept = locked in
    expect(accepted.tradieId).toBe(t1.id);
    expect((await mockBackend.getTradie(t1.id))!.status).toBe('job_accepted');

    await expect(mockBackend.acceptJob(j.id, t2.id)).rejects.toThrow(/already been taken/i);
  });
});

describe('workflow guards', () => {
  it('choose mode: a tradie cannot accept before the customer picks them', async () => {
    const cust = await newCustomer();
    const t = await readyTradie();
    const j = await job(cust, { assignmentMode: 'choose' });

    await expect(mockBackend.acceptJob(j.id, t.id)).rejects.toThrow(/still choosing/i);

    // Once picked, accepting locks it straight in.
    await mockBackend.selectTradie(j.id, t.id);
    const accepted = await mockBackend.acceptSelection(j.id, t.id);
    expect(accepted.status).toBe('confirmed');
  });

  it('blocks a second live job for the same trade; other trades are fine', async () => {
    const cust = await newCustomer();
    const t = await readyTradie({ trade: 'plumber' });
    const j = await job(cust, { trade: 'plumber' });
    await mockBackend.acceptJob(j.id, t.id); // plumbing job now in progress

    await expect(job(cust, { trade: 'plumber' })).rejects.toThrow(/already have a plumber job/i);

    const other = await job(cust, { trade: 'electrician' });
    expect(other.status).toBe('searching'); // different trade is fine

    // Finishing (or cancelling) the plumbing job frees the trade again.
    await mockBackend.cancelJob(j.id, 'customer');
    const again = await job(cust, { trade: 'plumber' });
    expect(again.status).toBe('searching');
  });

  it('choose jobs never appear as acceptable offers — candidates get a choose request instead', async () => {
    const cust = await newCustomer();
    const avail = await readyTradie();
    const j = await job(cust, { assignmentMode: 'choose' });

    const offers = await once<JobOffer[]>((cb) => mockBackend.subscribeJobOffers(avail.id, cb));
    expect(offers.some((o) => o.job.id === j.id)).toBe(false);

    const feed = await once<ChooseFeed>((cb) => mockBackend.subscribeChooseFeed(avail.id, cb));
    expect(feed.requests.some((o) => o.job.id === j.id)).toBe(true);
  });

  it('secondary trades receive matching jobs (plumber with electrician secondary)', async () => {
    const cust = await newCustomer();
    const multi = await readyTradie({ trade: 'plumber', secondaryTrades: ['electrician'] });
    const j = await job(cust, { trade: 'electrician' });
    expect(j.dispatch?.candidateIds).toContain(multi.id);
  });
});

describe('browse & choose', () => {
  it('lists available tradies and lets a busy one opt in', async () => {
    const cust = await newCustomer();
    const avail = await readyTradie();
    const busy = await readyTradie({ status: 'unavailable' });
    const j = await job(cust, { assignmentMode: 'choose' });

    expect(j.assignmentMode).toBe('choose');
    // Busy tradie is still in the dispatch pool (so it can be asked to opt in).
    expect(j.dispatch?.candidateIds).toContain(busy.id);

    const list = await once<TradieCandidate[]>((cb) =>
      mockBackend.subscribeAvailableTradies('electrician', { address: '', ...AK }, cb),
    );
    const listedIds = list.map((c) => c.tradie.id);
    expect(listedIds).toContain(avail.id);
    expect(listedIds).not.toContain(busy.id);

    await mockBackend.expressInterest(j.id, busy.id);
    const feed = await once<ChooseFeed>((cb) => mockBackend.subscribeChooseFeed(busy.id, cb));
    expect(feed).toBeDefined();
    const updated = await once<Job | null>((cb) => mockBackend.subscribeJob(j.id, cb));
    expect(updated!.interestedTradies?.some((t) => t.tradieId === busy.id)).toBe(true);
  });

  it('select -> accept confirms the job and assigns the chosen tradie', async () => {
    const cust = await newCustomer();
    const chosen = await readyTradie();
    const j = await job(cust, { assignmentMode: 'choose' });

    await mockBackend.selectTradie(j.id, chosen.id);
    const selectedJob = await once<Job | null>((cb) => mockBackend.subscribeJob(j.id, cb));
    expect(selectedJob!.selectedTradieId).toBe(chosen.id);

    const feed = await once<ChooseFeed>((cb) => mockBackend.subscribeChooseFeed(chosen.id, cb));
    expect(feed.selected.some((o) => o.job.id === j.id)).toBe(true);

    const confirmed = await mockBackend.acceptSelection(j.id, chosen.id);
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.tradieId).toBe(chosen.id);
    expect((await mockBackend.getTradie(chosen.id))!.status).toBe('job_accepted');
  });

  it('declineSelection clears the pick and blocks re-selection', async () => {
    const cust = await newCustomer();
    const picked = await readyTradie();
    const j = await job(cust, { assignmentMode: 'choose' });

    await mockBackend.selectTradie(j.id, picked.id);
    await mockBackend.declineSelection(j.id, picked.id);
    const after = await once<Job | null>((cb) => mockBackend.subscribeJob(j.id, cb));
    expect(after!.selectedTradieId).toBeUndefined();
    expect(after!.declinedBy).toContain(picked.id);
  });
});

describe('job completion', () => {
  it('runs the lifecycle and records a fee (waived by a free credit)', async () => {
    const cust = await newCustomer();
    const tr = await readyTradie();
    // Capture baselines by value — getTradie returns a live reference.
    const baseCompleted = tr.completedJobs;
    const baseCredits = tr.freeJobCredits;
    const j = await job(cust);

    await mockBackend.acceptJob(j.id, tr.id);
    await mockBackend.confirmJob(j.id);
    await mockBackend.startTravelling(j.id);
    await mockBackend.arriveOnSite(j.id, 'manual');
    await mockBackend.completeJob(j.id);

    const done = await once<Job | null>((cb) => mockBackend.subscribeJob(j.id, cb));
    expect(done!.status).toBe('completed');

    const after = (await mockBackend.getTradie(tr.id))!;
    expect(after.completedJobs).toBe(baseCompleted + 1);
    expect(after.freeJobCredits).toBe(baseCredits - 1);
    expect(after.status).toBe('available');

    const fees = await once<FeeLineItem[]>((cb) => mockBackend.subscribeTradieFees(tr.id, cb));
    expect(fees.length).toBe(1);
    expect(fees[0].status).toBe('waived_credit');
  });
});
