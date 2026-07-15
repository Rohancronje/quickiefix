import { mockBackend } from '../src/services/mockBackend';
import { ChooseFeed, JobOffer, TradieCandidate, Unsubscribe } from '../src/services/backend';
import { waveEligible } from '../src/lib/dispatch';
import { AgencyLink, Customer, FeeLineItem, Job, Tradie, TradeCategory } from '../src/types';

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

    await expect(job(cust, { trade: 'plumber' })).rejects.toThrow(/already have a live plumber job/i);

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

  it('blocks double-booking: a tradie on a live job cannot accept another', async () => {
    const c1 = await newCustomer();
    const c2 = await newCustomer();
    const t = await readyTradie();
    // Both offers land while t is free (the real race)…
    const a = await job(c1);
    const b = await job(c2);
    // …t takes one — the second accept must now be rejected.
    await mockBackend.acceptJob(a.id, t.id);
    await expect(mockBackend.acceptJob(b.id, t.id)).rejects.toThrow(/current job/i);
  });

  it('releaseJob hands the job back: searching again, tradie excluded and freed', async () => {
    const cust = await newCustomer();
    const t = await readyTradie();
    const j = await job(cust);
    await mockBackend.acceptJob(j.id, t.id);

    await mockBackend.releaseJob(j.id, t.id);
    const after = await once<Job | null>((cb) => mockBackend.subscribeJob(j.id, cb));
    expect(after!.status).toBe('searching');
    expect(after!.tradieId).toBeUndefined();
    expect(after!.declinedBy).toContain(t.id); // never offered to them again
    expect((await mockBackend.getTradie(t.id))!.status).toBe('available');
  });

  it('scheduled jobs anchor the dispatch clock at the booked time', async () => {
    const cust = await newCustomer();
    const t = await readyTradie();
    const when = Date.now() + 3 * 60 * 60 * 1000; // in 3 hours
    const j = await job(cust, { urgency: 'scheduled', scheduledFor: when });
    expect(j.dispatch?.startedAt).toBe(when);
    expect(j.scheduledFor).toBe(when);
    // Nobody is in the wave until the booked time arrives.
    expect(waveEligible(j, t.id, Date.now())).toBe(false);
    expect(waveEligible(j, t.id, when)).toBe(true);
  });

  it('completing a job frees the tradie but never overrides an explicit offline', async () => {
    const cust = await newCustomer();
    const t = await readyTradie();
    const j = await job(cust);
    await mockBackend.acceptJob(j.id, t.id);
    await mockBackend.arriveOnSite(j.id);
    // Tradie flips offline (end of day) before completing the last job.
    await mockBackend.setTradieStatus(t.id, 'offline');
    await mockBackend.completeJob(j.id);
    expect((await mockBackend.getTradie(t.id))!.status).toBe('offline');
  });

  it('agency properties dispatch panel-only with rates hidden; other addresses stay open market', async () => {
    const cust = await newCustomer();
    const onPanel = await readyTradie({ trade: 'plumber' });
    const offPanel = await readyTradie({ trade: 'plumber' });

    // Agency with one managed property (customer is the tenant/requester).
    const agency = await mockBackend.createAgencyForTest('Harbour PM', 'agency_admin_1');
    const prop = await mockBackend.createProperty(
      { id: 'agency_admin_1', name: 'Harbour PM' },
      { address: '1 Dock St, Auckland', ...AK },
    );
    await mockBackend.setPropertyAgency(prop.id, agency);

    // onPanel joins via the agent code; the agency approves.
    const agencyName = await mockBackend.requestAgencyLink(
      { id: onPanel.id, name: onPanel.businessName },
      agency.code,
      'tradie',
    );
    expect(agencyName).toBe('Harbour PM');
    const links = await once<AgencyLink[]>((cb) => mockBackend.subscribeMyAgencyLinks(onPanel.id, cb));
    await mockBackend.setAgencyLinkStatus(links[0].id, 'approved');

    // Job AT the managed property: panel-only + agency stamp + no rate snapshot.
    const j = await job(cust, { trade: 'plumber', propertyId: prop.id });
    expect(j.agencyId).toBe(agency.id);
    expect(j.dispatch?.candidateIds).toContain(onPanel.id);
    expect(j.dispatch?.candidateIds).not.toContain(offPanel.id);
    const accepted = await mockBackend.acceptJob(j.id, onPanel.id);
    expect(accepted.rateSnapshot).toBeUndefined(); // rates hidden on agency jobs

    // Same customer, DIFFERENT (non-portfolio) address: open market, rates back.
    await mockBackend.cancelJob(j.id, 'customer');
    const open = await job(cust, { trade: 'plumber' });
    expect(open.agencyId).toBeUndefined();
    expect(open.dispatch?.candidateIds).toContain(offPanel.id);
    const openAccepted = await mockBackend.acceptJob(open.id, offPanel.id);
    expect(openAccepted.rateSnapshot).toBeDefined();
  });

  it('employee seats seed the company NZBN + personal name, restored on removal', async () => {
    const t = await readyTradie();
    await mockBackend.setTradieNzbn(t.id, '9429-OWN');
    const company = await mockBackend.createCompany({
      name: 'North Shore Trades',
      adminUserId: 'boss_1',
      adminEmail: 'admin@nst.co.nz',
      nzbn: '9429-NST',
    });
    const tag = await mockBackend.issueTag(company.id, { name: 'T R', email: t.email });

    await mockBackend.claimTag(tag.code, t.id, 'employee');
    await mockBackend.validateTag(tag.id);
    let now = (await mockBackend.getTradie(t.id))!;
    expect(now.businessName).toBe('T R'); // personal name while employed
    expect(now.nzbn).toBe('9429-NST'); // company NZBN seeded
    expect(now.engagement).toBe('employee');

    await mockBackend.removeTag(tag.id, 'company');
    now = (await mockBackend.getTradie(t.id))!;
    expect(now.businessName).toBe('Biz'); // own identity restored
    expect(now.nzbn).toBe('9429-OWN');
    expect(now.companyId).toBeUndefined();
  });

  it('contractor seats keep the tradie business name and NZBN', async () => {
    const t = await readyTradie();
    await mockBackend.setTradieNzbn(t.id, '9429-OWN');
    const company = await mockBackend.createCompany({
      name: 'North Shore Trades',
      adminUserId: 'boss_2',
      adminEmail: 'admin@nst.co.nz',
      nzbn: '9429-NST',
    });
    const tag = await mockBackend.issueTag(company.id, { name: 'T R', email: t.email });

    await mockBackend.claimTag(tag.code, t.id, 'contractor');
    await mockBackend.validateTag(tag.id);
    const now = (await mockBackend.getTradie(t.id))!;
    expect(now.businessName).toBe('Biz'); // keeps own business
    expect(now.nzbn).toBe('9429-OWN'); // keeps own NZBN
    expect(now.engagement).toBe('contractor');
    expect(now.companyName).toBe('North Shore Trades'); // "Contractor for …"
  });

  it('contractors keep their own brand on open-market jobs; company badge only on company-sourced panel jobs', async () => {
    const cust = await newCustomer();
    const contractor = await readyTradie({ trade: 'plumber' });
    await mockBackend.setTradieNzbn(contractor.id, '9429-OWN');
    const company = await mockBackend.createCompany({
      name: 'North Shore Trades',
      adminUserId: 'boss_3',
      adminEmail: 'a@nst.co.nz',
      nzbn: '9429-NST',
    });
    const tag = await mockBackend.issueTag(company.id, { name: 'T R', email: contractor.email });
    await mockBackend.claimTag(tag.code, contractor.id, 'contractor');
    await mockBackend.validateTag(tag.id);

    // OPEN MARKET: no company stamp — the platform sourced this, not NST.
    const open = await job(cust, { trade: 'plumber' });
    const openAccepted = await mockBackend.acceptJob(open.id, contractor.id);
    expect(openAccepted.sourcedVia).toBe('open_market');
    expect(openAccepted.companyId).toBeUndefined();
    expect(openAccepted.rateSnapshot?.source).toBe('personal'); // own rates
    await mockBackend.cancelJob(open.id, 'customer');

    // COMPANY-SOURCED: agency panel held by the COMPANY (employees-only scope
    // would exclude them, so use 'all').
    const agency = await mockBackend.createAgencyForTest('Harbour PM', 'ag_admin_2');
    const prop = await mockBackend.createProperty(
      { id: 'ag_admin_2', name: 'Harbour PM' },
      { address: '2 Dock St, Auckland', ...AK },
    );
    await mockBackend.setPropertyAgency(prop.id, agency);
    // company joins the panel with scope 'all' (link written directly for test)
    const linkName = await mockBackend.requestAgencyLink(
      { id: company.id, name: company.name },
      agency.code,
      'tradie', // kind is irrelevant for the filter test; use helper below instead
    );
    expect(linkName).toBe('Harbour PM');
    // flip that link to a company-kind approved link
    const links = await once<AgencyLink[]>((cb) => mockBackend.subscribeMyAgencyLinks(company.id, cb));
    await mockBackend.setAgencyLinkStatus(links[0].id, 'approved');
    await mockBackend.setAgencyLinkKind(links[0].id, 'company', 'all');

    const panelJob = await job(cust, { trade: 'plumber', propertyId: prop.id });
    expect(panelJob.dispatch?.candidateIds).toContain(contractor.id); // via company
    const panelAccepted = await mockBackend.acceptJob(panelJob.id, contractor.id);
    expect(panelAccepted.sourcedVia).toBe('company_panel');
    expect(panelAccepted.companyName).toBe('North Shore Trades'); // company badge ON
  });

  it("company panels scoped to 'employees' exclude contractors from dispatch", async () => {
    const cust = await newCustomer();
    const contractor = await readyTradie({ trade: 'plumber' });
    const company = await mockBackend.createCompany({
      name: 'NST 2',
      adminUserId: 'boss_4',
      adminEmail: 'b@nst.co.nz',
    });
    const tag = await mockBackend.issueTag(company.id, { name: 'T R', email: contractor.email });
    await mockBackend.claimTag(tag.code, contractor.id, 'contractor');
    await mockBackend.validateTag(tag.id);

    const agency = await mockBackend.createAgencyForTest('Bay PM', 'ag_admin_3');
    const prop = await mockBackend.createProperty(
      { id: 'ag_admin_3', name: 'Bay PM' },
      { address: '3 Bay Rd, Auckland', ...AK },
    );
    await mockBackend.setPropertyAgency(prop.id, agency);
    await mockBackend.requestAgencyLink({ id: company.id, name: company.name }, agency.code, 'tradie');
    const links = await once<AgencyLink[]>((cb) => mockBackend.subscribeMyAgencyLinks(company.id, cb));
    await mockBackend.setAgencyLinkStatus(links[0].id, 'approved');
    await mockBackend.setAgencyLinkKind(links[0].id, 'company', 'employees');

    const j = await job(cust, { trade: 'plumber', propertyId: prop.id });
    expect(j.dispatch?.candidateIds).not.toContain(contractor.id); // contractor excluded
  });

  it('cancelling stamps who cancelled (drives the push to the other party)', async () => {
    const cust = await newCustomer();
    await readyTradie();
    const j = await job(cust);
    await mockBackend.cancelJob(j.id, 'customer');
    const after = await once<Job | null>((cb) => mockBackend.subscribeJob(j.id, cb));
    expect(after!.status).toBe('cancelled');
    expect(after!.cancelledBy).toBe('customer');
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
