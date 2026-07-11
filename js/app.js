/* ============================================================================
 * 530A Family Tracker - multi-tenant, email-link auth build.
 *
 * Sections in this file:
 *   0. Configuration check & Firebase init
 *   1. App state
 *   2. DOM node references
 *   3. Helpers (el(), calculateAge(), etc.)
 *   4. Auth flow (sign in, magic link, confirm, sign out)
 *   5. Family routing & creation
 *   6. Realtime listeners (subscribe/unsubscribe)
 *   7. Render functions (Summary, Grid, Activity feed, Children manager, Child details)
 *   8. Mutations (add child, add/delete contribution, invite/remove members)
 *   9. Event delegation wiring
 *  10. Bootstrap
 * ========================================================================== */


/* --------------------------------------------------------------------------
 * 0. Configuration check & Firebase init
 * ----------------------------------------------------------------------- */

if (!window.firebaseConfig || window.firebaseConfig.apiKey === "YOUR_API_KEY") {
  // Existing setup-instructions overlay. (Kept verbatim from prior build.)
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.app-content').innerHTML = `
      <div class="card glass" style="border-color: var(--color-danger); max-width: 600px; margin: 40px auto; padding: 32px; z-index: 10;">
        <h2 style="color: var(--color-danger); margin-bottom: 16px; font-size: 22px; font-weight: 700;">Configuration Required</h2>
        <p style="margin-bottom: 16px; font-size: 14px; line-height: 1.6; color: var(--text-secondary);">
          It looks like you haven't configured your Firebase connection yet. To enable real-time cloud sync across your family's devices, you need to create a config file:
        </p>
        <h3 style="font-size: 15px; margin-bottom: 10px; color: #fff; font-weight: 600;">Setup Steps:</h3>
        <ol style="margin-left: 20px; margin-bottom: 24px; font-size: 13px; line-height: 2; color: var(--text-secondary);">
          <li>Go into the <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-family: monospace;">public/js/</code> folder.</li>
          <li>Duplicate the template file <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-family: monospace;">config.example.js</code> and name the copy <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-family: monospace;">config.js</code>.</li>
          <li>Open your new <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-family: monospace;">config.js</code> and paste your Firebase Web App configuration credentials (obtained from the Firebase Console).</li>
          <li>Make sure you enable <strong>Cloud Firestore</strong> database in the Firebase project console AND <strong>Authentication > Email/Password (link)</strong>.</li>
          <li>Deploy <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-family: monospace;">firestore.rules</code> via <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-family: monospace;">firebase deploy --only firestore:rules</code>.</li>
        </ol>
        <p style="font-size: 13px; color: var(--color-accent); font-weight: 600;">After saving the config.js file (or completing the GitHub Actions deploy), refresh this page!</p>
      </div>
    `;
    const actionBtns = document.querySelector('.action-buttons');
    if (actionBtns) actionBtns.style.display = 'none';
  });
  throw new Error("Firebase Configuration Missing. See README.md for setup steps.");
}

firebase.initializeApp(window.firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// Use the browser's current URL as the magic-link redirect target, so dev
// (localhost:3000) and prod (https://user.github.io/repo/) both work without
// hard-coding either in source.
const APP_REDIRECT_URL = window.location.origin +
  (window.location.pathname === '/' ? '/' : window.location.pathname.replace(/\/$/, ''));

// Calendar-year floor for 530A contributions. 530A accounts became effective
// 2026, so no contribution year can precede this. Update this single
// constant if/when the floor moves.
const MIN_TRACKED_YEAR = 2026;


/* --------------------------------------------------------------------------
 * 1. App state
 * ----------------------------------------------------------------------- */

let state = {
  currentUserEmail: null,
  currentFamilyId:   null,
  familyData:        null,           // { familyName, members: { email: 'admin' | 'viewer' } }
  children:          [],
  contributions:     [],
  selectedYear:      new Date().getFullYear()
};

let activeDetailedChildId = null;
let unsubFamilyDoc = null;
let unsubChildren  = null;
let unsubContribs  = null;


/* --------------------------------------------------------------------------
 * 2. DOM node references
 * ----------------------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

const dom = {
  // Year + summary
  yearSelect:             $('yearSelect'),
  summaryYear:            $('summaryYear'),
  summaryTotal:           $('summaryTotal'),
  summaryRemaining:       $('summaryRemaining'),
  summaryProgressBar:     $('summaryProgressBar'),
  summaryChildrenCount:   $('summaryChildrenCount'),
  summaryPercentage:      $('summaryPercentage'),

  // Sections
  childrenGrid:           $('childrenGrid'),
  activityTableBody:      $('activityTableBody'),
  noActivityMessage:      $('noActivityMessage'),

  // Existing modals
  contributeModal:        $('contributeModal'),
  manageChildrenModal:    $('manageChildrenModal'),
  childDetailsModal:      $('childDetailsModal'),

  // Existing buttons / forms
  openContributeBtn:      $('openContributeBtn'),
  openManageChildrenBtn:  $('openManageChildrenBtn'),
  contributeForm:         $('contributeForm'),
  addChildForm:           $('addChildForm'),

  // Contribute form inputs
  contribChildSelect:     $('contribChild'),
  contribNameInput:       $('contribName'),
  contribAmountInput:     $('contribAmount'),
  contribDateInput:       $('contribDate'),
  contribNoteInput:       $('contribNote'),
  liveLimitMessage:       $('liveLimitMessage'),
  contributeError:        $('contributeError'),

  addChildError:          $('addChildError'),
  childrenList:           $('childrenList'),

  // Child details modal
  childDetailsTitle:      $('childDetailsTitle'),
  childDetailsDob:        $('childDetailsDob'),
  childDetailsAge:        $('childDetailsAge'),
  childDetailsYear:       $('childDetailsYear'),
  childDetailsLimitStatus:$('childDetailsLimitStatus'),
  childDetailsTableBody:  $('childDetailsTableBody'),
  noChildDetailsMessage:  $('noChildDetailsMessage'),
  childDetailsListYear:   $('childDetailsListYear'),

  // New modals + form fields
  authModal:              $('authModal'),
  authModalContent:       $('authModalContent'),
  authModalTitle:         $('authModalTitle'),
  createFamilyModal:      $('createFamilyModal'),
  createFamilyForm:       $('createFamilyForm'),
  familyNameInput:        $('familyNameInput'),
  createFamilyError:      $('createFamilyError'),
  manageMembersModal:     $('manageMembersModal'),
  inviteMemberForm:       $('inviteMemberForm'),
  inviteEmailInput:       $('inviteEmail'),
  inviteRoleSelect:       $('inviteRole'),
  inviteMemberError:      $('inviteMemberError'),
  membersList:            $('membersList'),
  lastAdminWarning:       $('lastAdminWarning'),
  signOutBtn:             $('signOutBtn'),
  manageMembersBtn:       $('manageMembersBtn')
};


/* --------------------------------------------------------------------------
 * 3. Helpers
 * ----------------------------------------------------------------------- */

function el(tag, className, textContent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textContent != null) node.textContent = textContent;
  return node;
}

function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMoney(amount) {
  return '$' + Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function calculateAge(birthYear) {
  return new Date().getFullYear() - Number(birthYear);
}

function limitYearForBirthYear(birthYear) {
  return Number(birthYear) + 18;
}

function isAdmin() {
  return !!state.familyData
    && state.familyData.members[state.currentUserEmail] === 'admin';
}

function countAdmins() {
  if (!state.familyData || !state.familyData.members) return 0;
  return Object.values(state.familyData.members).filter(r => r === 'admin').length;
}

function showModal(modalEl)  { if (modalEl) modalEl.style.display = 'flex'; }
function hideModal(modalEl)  { if (modalEl) modalEl.style.display = 'none'; }

function makeTrashIcon() {
  // Static SVG path - safe to build via innerHTML because no user data flows in.
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('xmlns', svgNS);
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML =
    '<polyline points="3 6 5 6 21 6"></polyline>' +
    '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
    '<line x1="10" y1="11" x2="10" y2="17"></line>' +
    '<line x1="14" y1="11" x2="14" y2="17"></line>';
  return svg;
}

function refreshAdminOnlyUI() {
  // Toggle a body class so CSS (and visible buttons) can switch on / off.
  document.body.classList.toggle('user-is-admin', isAdmin());
  if (dom.manageMembersBtn) {
    dom.manageMembersBtn.style.display = isAdmin() ? '' : 'none';
  }
}


/* --------------------------------------------------------------------------
 * 4. Auth flow
 * ----------------------------------------------------------------------- */

function showAuth_emailEntry(reasonMessage) {
  dom.authModalTitle.textContent = 'Sign in';
  dom.authModalContent.innerHTML =
    (reasonMessage ? `<div class="alert alert-danger">${escapeHTML(reasonMessage)}</div>` : '') +
    `
      <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
        Enter your email to receive a one-time sign-in link. No passwords.
      </p>
      <form id="authEnterEmailForm" class="modal-form" autocomplete="off">
        <div class="form-group">
          <label for="authEmailInput">Your email</label>
          <input type="email" id="authEmailInput" required autocomplete="email"
            placeholder="you@example.com">
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Send sign-in link</button>
        </div>
      </form>
    `;
  $('authEnterEmailForm').addEventListener('submit', handleEnterEmailSubmit);
  showModal(dom.authModal);
}

function showAuth_inbox(email) {
  dom.authModalTitle.textContent = 'Check your inbox';
  dom.authModalContent.innerHTML =
    `<p style="font-size: 14px; color: var(--text-secondary);">
       We've emailed a sign-in link to <strong>${escapeHTML(email)}</strong>.
       Open it in any browser to continue.
     </p>
     <div class="form-actions">
       <button type="button" class="btn btn-secondary" id="authResendBtn">Resend</button>
       <button type="button" class="btn btn-secondary" id="authUseOtherBtn">Use a different email</button>
     </div>`;
  $('authResendBtn').addEventListener('click', () => handleEnterEmailSubmit({
    preventDefault: () => {},
    target: { querySelector: () => ({ value: email }) }
  }));
  $('authUseOtherBtn').addEventListener('click', () => {
    localStorage.removeItem('emailForSignIn');
    showAuth_emailEntry();
  });
  showModal(dom.authModal);
}

async function handleEnterEmailSubmit(e) {
  e.preventDefault();
  const input = e.target.querySelector('input[type="email"]') || $('authEmailInput');
  const email = (input && input.value || '').trim();
  if (!email) return;
  try {
    await auth.sendSignInLinkToEmail(email, { url: APP_REDIRECT_URL, handleCodeInApp: true });
    localStorage.setItem('emailForSignIn', email);
    showAuth_inbox(email);
  } catch (err) {
    showAuth_emailEntry(err.message);
  }
}

function showAuth_confirmEmail(errorMessage) {
  dom.authModalTitle.textContent = 'Confirm your email';
  dom.authModalContent.innerHTML =
    (errorMessage ? `<div class="alert alert-danger">${escapeHTML(errorMessage)}</div>` : '') +
    `<p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
       You opened the sign-in link on a new device. Please re-enter your email so we can complete sign-in.
     </p>
     <form id="authConfirmEmailForm" class="modal-form" autocomplete="off">
       <div class="form-group">
         <label for="authConfirmEmailInput">Your email</label>
         <input type="email" id="authConfirmEmailInput" required autocomplete="email">
       </div>
       <div class="form-actions">
         <button type="submit" class="btn btn-primary">Continue</button>
       </div>
     </form>`;
  $('authConfirmEmailForm').addEventListener('submit', handleConfirmEmailSubmit);
  showModal(dom.authModal);
}

async function handleConfirmEmailSubmit(e) {
  e.preventDefault();
  const email = ($('authConfirmEmailInput').value || '').trim();
  if (!email) return;
  try {
    await auth.signInWithEmailLink(email, window.location.href);
    localStorage.setItem('emailForSignIn', email);
  } catch (err) {
    showAuth_confirmEmail(err.message);
  }
}

async function completeEmailLinkSignIn() {
  // Called when isSignInWithEmailLink(window.location.href) is true.
  // Two cases:
  //   (a) Same device: localStorage has the email from step 1. Complete silently.
  //   (b) Different device: localStorage is empty. Ask user to confirm email.
  const stored = localStorage.getItem('emailForSignIn');
  if (stored) {
    try {
      await auth.signInWithEmailLink(stored, window.location.href);
      // onAuthStateChanged picks up from here.
    } catch (err) {
      localStorage.removeItem('emailForSignIn');
      showAuth_confirmEmail(err.message);
    }
  } else {
    showAuth_confirmEmail();
  }
}

async function signOutAndReroute() {
  try { await auth.signOut(); } catch (_) { /* ignore */ }
  localStorage.removeItem('emailForSignIn');
  clearListeners();
  state.currentFamilyId = null;
  state.familyData = null;
  state.children = [];
  state.contributions = [];
  activeDetailedChildId = null;
  hideModal(dom.contributeModal);
  hideModal(dom.manageChildrenModal);
  hideModal(dom.childDetailsModal);
  hideModal(dom.manageMembersModal);
  hideModal(dom.createFamilyModal);
  showAuth_emailEntry();
}


/* --------------------------------------------------------------------------
 * 5. Family routing & creation
 * ----------------------------------------------------------------------- */

async function routeToFamily(user) {
  state.currentUserEmail = user.email;
  try {
    // Primary: indexed array-contains lookup. Works for families whose create /
    // invite / remove sites already maintain `memberEmails` alongside `members`.
    // `array-contains` is not affected by dots in the lookup value, so emails
    // are safe as array elements.
    let snap = await db.collection('families')
      .where('memberEmails', 'array-contains', user.email)
      .limit(1)
      .get();
    if (!snap.empty) {
      const familyDoc = snap.docs[0];
      enterFamily(familyDoc.id, familyDoc.data());
      return;
    }

    // Fallback: scan all families and check the legacy `members` map directly.
    // Covers family docs that pre-date the array (created before this code
    // landed, or produced by an older migrate-to-families run).
    const allSnap = await db.collection('families').get();
    const match = allSnap.docs.find(d => {
      const m = d.data().members;
      return m && m[user.email] != null;
    });
    if (match) {
      enterFamily(match.id, match.data());
      // Self-heal: backfill `memberEmails` once so future visits hit the
      // fast path. Admins only — viewers can't pass the update rule, so
      // attempting would just throw and log. An admin's invite/remove will
      // also keep the array in sync going forward.
      if (!Array.isArray(match.data().memberEmails) && isAdmin()) {
        const emails = Object.keys(match.data().members || {});
        db.collection('families').doc(match.id)
          .update({ memberEmails: emails })
          .catch(err => console.warn('memberEmails backfill failed:', err));
      }
    } else {
      showCreateFamilyModal();
    }
  } catch (err) {
    showCriticalError(
      'Could not load your family. Verify that firestore.rules are deployed and that your domain is in Firebase Authentication > Authorized domains.',
      err
    );
  }
}

function showCriticalError(message, err) {
  document.querySelector('.app-content').innerHTML =
    `<div class="card glass" style="border-color: var(--color-danger); max-width: 600px; margin: 40px auto; padding: 32px;">
       <h2 style="color: var(--color-danger);">Connection problem</h2>
       <p style="font-size: 14px; color: var(--text-secondary);">${escapeHTML(message)}</p>
       <pre style="font-size: 11px; opacity: 0.6; white-space: pre-wrap;">${escapeHTML(err && err.message || String(err))}</pre>
       <button id="reloadBtn" class="btn btn-primary" style="margin-top: 16px;">Reload</button>
     </div>`;
  $('reloadBtn').addEventListener('click', () => window.location.reload());
}

function showCreateFamilyModal() {
  dom.createFamilyError.style.display = 'none';
  if (dom.familyNameInput) dom.familyNameInput.value = '';
  showModal(dom.createFamilyModal);
}

async function handleCreateFamilySubmit(e) {
  e.preventDefault();
  dom.createFamilyError.style.display = 'none';
  const familyName = dom.familyNameInput.value.trim();
  if (!familyName) return;
  try {
    const adminEmail = state.currentUserEmail;
    const familyData = {
      familyName,
      members:      { [adminEmail]: 'admin' },
      memberEmails: [adminEmail],
    };
    const ref = await db.collection('families').add(familyData);
    hideModal(dom.createFamilyModal);
    enterFamily(ref.id, familyData);
  } catch (err) {
    dom.createFamilyError.textContent = err.message;
    dom.createFamilyError.style.display = 'block';
  }
}

function enterFamily(familyId, familyData) {
  state.currentFamilyId = familyId;
  state.familyData = familyData;
  hideModal(dom.authModal);
  hideModal(dom.createFamilyModal);
  setupRealtimeListeners(familyId);
  setupYearDropdown();
  render();
  refreshAdminOnlyUI();
}


/* --------------------------------------------------------------------------
 * 6. Realtime listeners
 * ----------------------------------------------------------------------- */

function clearListeners() {
  if (unsubFamilyDoc) { unsubFamilyDoc(); unsubFamilyDoc = null; }
  if (unsubChildren)  { unsubChildren();  unsubChildren  = null; }
  if (unsubContribs)  { unsubContribs();  unsubContribs  = null; }
}

function setupRealtimeListeners(familyId) {
  clearListeners();
  const famRef = db.collection('families').doc(familyId);

  unsubFamilyDoc = famRef.onSnapshot(doc => {
    if (!doc.exists) { signOutAndReroute(); return; }
    state.familyData = doc.data();
    refreshAdminOnlyUI();
    if (dom.manageMembersModal.style.display === 'flex') renderMembersList();
  }, err => console.error('Family doc listener error:', err));

  unsubChildren = famRef.collection('children').onSnapshot(snap => {
    state.children = [];
    snap.forEach(d => state.children.push({ id: d.id, ...d.data() }));
    render();
    if (activeDetailedChildId) openChildDetails(activeDetailedChildId);
    renderManageChildrenList();
    populateChildSelect();
  }, err => console.error('Children listener error:', err));

  unsubContribs = famRef.collection('contributions').onSnapshot(snap => {
    state.contributions = [];
    snap.forEach(d => state.contributions.push({ id: d.id, ...d.data() }));
    updateYearDropdownWithOptions();
    render();
    if (activeDetailedChildId) openChildDetails(activeDetailedChildId);
  }, err => console.error('Contributions listener error:', err));
}


/* --------------------------------------------------------------------------
 * 7. Render functions
 * ----------------------------------------------------------------------- */

function render() {
  renderSummary();
  renderChildrenGrid();
  renderActivityFeed();
}

function setupYearDropdown() {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = Math.max(MIN_TRACKED_YEAR, currentYear); y <= currentYear + 5; y++) years.push(y);
  dom.yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  dom.yearSelect.value = state.selectedYear;

  // Re-bind (removing old listener via node clone).
  const fresh = dom.yearSelect.cloneNode(true);
  dom.yearSelect.parentNode.replaceChild(fresh, dom.yearSelect);
  dom.yearSelect = fresh;
  dom.yearSelect.addEventListener('change', (e) => {
    state.selectedYear = parseInt(e.target.value, 10);
    render();
    if (activeDetailedChildId && dom.childDetailsModal.style.display === 'flex') {
      openChildDetails(activeDetailedChildId);
    }
  });
}

function updateYearDropdownWithOptions() {
  const current = new Set(Array.from(dom.yearSelect.options).map(o => parseInt(o.value, 10)));
  let updated = false;
  state.contributions.forEach(c => {
    if (typeof c.year === 'number' && c.year >= MIN_TRACKED_YEAR && !current.has(c.year)) {
      const opt = document.createElement('option');
      opt.value = c.year;
      opt.textContent = c.year;
      dom.yearSelect.appendChild(opt);
      updated = true;
    }
  });
  if (updated) {
    const opts = Array.from(dom.yearSelect.options).sort(
      (a, b) => parseInt(a.value, 10) - parseInt(b.value, 10)
    );
    dom.yearSelect.innerHTML = '';
    opts.forEach(o => dom.yearSelect.add(o));
    dom.yearSelect.value = state.selectedYear;
  }
}

function renderSummary() {
  if (!state.familyData) return;
  dom.summaryYear.textContent = state.selectedYear;

  const yearContribs = state.contributions.filter(c => c.year === state.selectedYear);
  const total = yearContribs.reduce((sum, c) => sum + c.amount, 0);

  let activeCount = 0, maxPossible = 0, currentActiveTotal = 0;
  state.children.forEach(child => {
    const limY = limitYearForBirthYear(child.birthYear);
    if (state.selectedYear < limY) {
      activeCount++;
      maxPossible += 5000;
      currentActiveTotal += yearContribs
        .filter(c => c.childId === child.id)
        .reduce((sum, c) => sum + c.amount, 0);
    }
  });
  const remaining = Math.max(0, maxPossible - currentActiveTotal);
  const percent   = maxPossible > 0 ? Math.min((currentActiveTotal / maxPossible) * 100, 100) : 0;

  dom.summaryTotal.textContent      = formatMoney(total);
  dom.summaryRemaining.textContent = formatMoney(remaining) + ' left';
  dom.summaryChildrenCount.textContent =
    `${state.children.length} total profile${state.children.length === 1 ? '' : 's'} (${activeCount} eligible in ${state.selectedYear})`;
  dom.summaryProgressBar.style.width = percent + '%';
  dom.summaryPercentage.textContent = `${percent.toFixed(1)}% of max eligible limit reached`;
}

function renderChildrenGrid() {
  dom.childrenGrid.innerHTML = '';

  if (state.children.length === 0) {
    const empty = el('div', 'card glass text-center');
    empty.style.gridColumn = '1 / -1';
    empty.style.padding = '40px';
    const p = el('p', null, 'No children profiles created yet.');
    p.style.color = 'var(--text-secondary)';
    p.style.marginBottom = '16px';
    empty.appendChild(p);
    const btn = el('button', 'btn btn-secondary', 'Add a Child Profile');
    btn.id = 'addFirstChildBtn';
    btn.addEventListener('click', () => {
      resetAddChildForm();
      renderManageChildrenList();
      showModal(dom.manageChildrenModal);
    });
    empty.appendChild(btn);
    dom.childrenGrid.appendChild(empty);
    return;
  }

  state.children.forEach(child => {
    const limY = limitYearForBirthYear(child.birthYear);
    const isOverAge = state.selectedYear >= limY;
    const childYearContribs = state.contributions.filter(
      c => c.childId === child.id && c.year === state.selectedYear
    );
    const contributed     = childYearContribs.reduce((sum, c) => sum + c.amount, 0);
    const remaining       = 5000 - contributed;
    const progressPercent = Math.min((contributed / 5000) * 100, 100);
    const currentAge      = calculateAge(child.birthYear);
    const cardClass       = isOverAge ? 'child-card card glass card-inactive' : 'child-card card glass';
    const badgeClass      = isOverAge ? 'child-age-badge badge-inactive' : 'child-age-badge';

    const card = el('div', cardClass);
    card.dataset.childId = child.id;

    const header = el('div', 'child-card-header');
    const title  = el('div', 'child-card-title');
    title.appendChild(el('h3', null, child.name));
    title.appendChild(el('p', null, `Born: ${child.birthYear} • Turns 18 in ${limY}`));
    header.appendChild(title);
    header.appendChild(el('div', badgeClass, `Age ${currentAge}`));
    card.appendChild(header);

    const progressWrap = el('div', 'child-limit-progress');
    const progressText = el('div', 'child-progress-text');
    const limitSpan = el('span', 'limit');
    if (isOverAge) {
      const s = el('span', null, 'Stopped (Turns 18)');
      s.style.color = 'var(--color-danger)'; s.style.fontWeight = '600';
      limitSpan.appendChild(s);
    } else if (contributed >= 5000) {
      const s = el('span', null, 'Maxed Out');
      s.style.color = 'var(--color-primary)'; s.style.fontWeight = '600';
      limitSpan.appendChild(s);
    } else {
      const s = el('span', null, `${((contributed / 5000) * 100).toFixed(0)}% Fill`);
      s.style.color = 'var(--text-secondary)';
      limitSpan.appendChild(s);
    }
    progressText.appendChild(limitSpan);

    const amountSpan = el('span', 'amount');
    amountSpan.appendChild(document.createTextNode(
      '$' + contributed.toLocaleString('en-US', { minimumFractionDigits: 2 })
    ));
    const limitText = el('span', 'limit', ' / $5,000');
    amountSpan.appendChild(limitText);
    progressText.appendChild(amountSpan);
    progressWrap.appendChild(progressText);

    const pbContainer = el('div', 'progress-bar-container');
    pbContainer.style.height = '8px';
    const pbFill = el('div', 'progress-bar-fill');
    pbFill.style.width = (isOverAge ? 0 : progressPercent) + '%';
    pbFill.style.background = contributed >= 5000 ? 'var(--color-primary)' : 'var(--color-secondary)';
    pbContainer.appendChild(pbFill);
    progressWrap.appendChild(pbContainer);
    card.appendChild(progressWrap);

    const footer = el('div', 'child-card-footer');
    footer.appendChild(el('span', null, isOverAge ? 'No contribution allowed' : 'Remaining limit:'));
    footer.appendChild(el('span', 'remaining-value',
      isOverAge ? '$0.00' : '$' + remaining.toLocaleString('en-US', { minimumFractionDigits: 2 })
    ));
    card.appendChild(footer);

    card.addEventListener('click', () => openChildDetails(child.id));
    dom.childrenGrid.appendChild(card);
  });
}

function renderActivityFeed() {
  dom.activityTableBody.innerHTML = '';

  const yearContribs = state.contributions.filter(c => c.year === state.selectedYear);
  yearContribs.sort((a, b) => {
    const dc = b.date.localeCompare(a.date);
    if (dc !== 0) return dc;
    return b.id.localeCompare(a.id);
  });

  if (yearContribs.length === 0) {
    dom.noActivityMessage.style.display = 'block';
    return;
  }
  dom.noActivityMessage.style.display = 'none';

  yearContribs.forEach(contrib => {
    const child = state.children.find(c => c.id === contrib.childId);
    const childName = child ? child.name : 'Unknown Child';

    const tr = el('tr');

    tr.appendChild(el('td', null, contrib.date));
    tr.appendChild(el('td', 'table-child-name', childName));
    tr.appendChild(el('td', null, contrib.contributorName));
    tr.appendChild(el('td', 'table-amount', formatMoney(contrib.amount)));

    const noteTd = el('td');
    const noteSpan = el('span', null, contrib.note && contrib.note.length ? contrib.note : '—');
    noteSpan.style.color = 'var(--text-secondary)';
    noteSpan.style.fontSize = '13px';
    noteTd.appendChild(noteSpan);
    tr.appendChild(noteTd);

    // Delete button - emits a delegated click event with data-contrib-id.
    const actionTd = el('td');
    const delBtn = el('button', 'btn-danger-link');
    delBtn.dataset.action = 'delete-contribution';
    delBtn.dataset.contribId = contrib.id;
    delBtn.appendChild(makeTrashIcon());
    delBtn.appendChild(document.createTextNode('Delete'));
    // Note: we intentionally leave the inline SVG flow intact because it
    // contains no user data. The delegated listener in section 9 wires
    // the click to handleDeleteContribution.
    actionTd.appendChild(delBtn);
    tr.appendChild(actionTd);

    dom.activityTableBody.appendChild(tr);
  });
}

function populateChildSelect() {
  dom.contribChildSelect.innerHTML = '<option value="" disabled selected>Select child...</option>';
  [...state.children]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(child => {
      const limY = limitYearForBirthYear(child.birthYear);
      const isOverAge = state.selectedYear >= limY;
      const opt = document.createElement('option');
      opt.value = child.id;
      opt.textContent = isOverAge
        ? `${child.name} (Stopped - Turns 18 in ${limY})`
        : child.name;
      if (isOverAge) opt.style.color = 'var(--text-muted)';
      dom.contribChildSelect.appendChild(opt);
    });
}

function updateLiveValidation() {
  const childId  = dom.contribChildSelect.value;
  const amountStr = dom.contribAmountInput.value;
  const dateStr   = dom.contribDateInput.value;

  if (!childId) {
    dom.liveLimitMessage.textContent = 'Select a child to view remaining limit.';
    dom.liveLimitMessage.className = 'form-help-text';
    enableSubmitButton(true);
    return;
  }
  const child = state.children.find(c => c.id === childId);
  if (!child) return;

  const amount    = parseFloat(amountStr);
  const dateYear  = dateStr ? parseInt(dateStr.split('-')[0], 10) : state.selectedYear;
  const limY      = limitYearForBirthYear(child.birthYear);

  if (dateYear >= limY) {
    dom.liveLimitMessage.textContent =
      `Contributions blocked. ${child.name} turns 18 in ${limY}, so contributions stop for ${dateYear}.`;
    dom.liveLimitMessage.className = 'form-help-text text-danger';
    enableSubmitButton(false);
    return;
  }

  const childYearContribs = state.contributions.filter(
    c => c.childId === childId && c.year === dateYear
  );
  const contributed = childYearContribs.reduce((sum, c) => sum + c.amount, 0);
  const remaining   = 5000 - contributed;

  if (isNaN(amount) || amount <= 0) {
    dom.liveLimitMessage.textContent =
      `Limit for ${child.name} in ${dateYear}: ${formatMoney(remaining)} remaining.`;
    dom.liveLimitMessage.className = 'form-help-text';
    enableSubmitButton(true);
  } else if (amount > remaining) {
    dom.liveLimitMessage.textContent =
      `Error: Contribution of ${formatMoney(amount)} exceeds the remaining limit of ${formatMoney(remaining)}.`;
    dom.liveLimitMessage.className = 'form-help-text text-danger';
    enableSubmitButton(false);
  } else {
    dom.liveLimitMessage.textContent =
      `Valid contribution! ${formatMoney(remaining - amount)} will remain of the yearly limit.`;
    dom.liveLimitMessage.className = 'form-help-text text-success';
    enableSubmitButton(true);
  }
}

function enableSubmitButton(enable) {
  const btn = dom.contributeForm.querySelector('button[type="submit"]');
  if (!btn) return;
  btn.disabled = !enable;
  btn.style.opacity = enable ? '1' : '0.5';
  btn.style.cursor = enable ? 'pointer' : 'not-allowed';
}

function resetContributeForm() {
  dom.contributeForm.reset();
  dom.contributeError.style.display = 'none';
  dom.liveLimitMessage.textContent = '';
  dom.liveLimitMessage.className = 'form-help-text';
  enableSubmitButton(true);
}

function resetAddChildForm() {
  dom.addChildForm.reset();
  dom.addChildError.style.display = 'none';
}

function renderManageChildrenList() {
  dom.childrenList.innerHTML = '';
  if (state.children.length === 0) {
    return; // empty; placeholder is the modal content area.
  }

  [...state.children]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(child => {
      const item = el('div', 'profile-item');
      const info = el('div', 'profile-item-info');
      info.appendChild(el('h4', null, child.name));
      info.appendChild(el('p', null, `DOB: ${child.birthYear}`));
      item.appendChild(info);

      const btn = el('button', 'btn-danger-link');
      btn.dataset.action = 'delete-child';
      btn.dataset.childId = child.id;
      btn.appendChild(makeTrashIcon());
      btn.appendChild(document.createTextNode('Delete'));
      item.appendChild(btn);

      dom.childrenList.appendChild(item);
    });
}

function openChildDetails(childId) {
  const child = state.children.find(c => c.id === childId);
  if (!child) return;
  activeDetailedChildId = childId;

  dom.childDetailsTitle.textContent = `${child.name}'s Account History`;
  dom.childDetailsDob.textContent   = child.birthYear;
  dom.childDetailsAge.textContent   = `${calculateAge(child.birthYear)} years`;
  dom.childDetailsYear.textContent  = state.selectedYear;
  dom.childDetailsListYear.textContent = state.selectedYear;

  const childContribs = state.contributions.filter(
    c => c.childId === childId && c.year === state.selectedYear
  );
  const total = childContribs.reduce((sum, c) => sum + c.amount, 0);
  dom.childDetailsLimitStatus.textContent = `${formatMoney(total)} / $5,000.00`;

  dom.childDetailsTableBody.innerHTML = '';
  if (childContribs.length === 0) {
    dom.noChildDetailsMessage.style.display = 'block';
  } else {
    dom.noChildDetailsMessage.style.display = 'none';
    childContribs.sort((a, b) => b.date.localeCompare(a.date));
    childContribs.forEach(contrib => {
      const tr = el('tr');
      tr.appendChild(el('td', null, contrib.date));
      tr.appendChild(el('td', null, contrib.contributorName));
      tr.appendChild(el('td', 'table-amount', formatMoney(contrib.amount)));

      const noteTd = el('td');
      const noteSpan = el('span', null, contrib.note && contrib.note.length ? contrib.note : '—');
      noteSpan.style.color = 'var(--text-secondary)';
      noteSpan.style.fontSize = '13px';
      noteTd.appendChild(noteSpan);
      tr.appendChild(noteTd);

      const actionTd = el('td');
      const btn = el('button', 'btn-danger-link');
      btn.dataset.action = 'delete-contribution';
      btn.dataset.contribId = contrib.id;
      btn.appendChild(makeTrashIcon());
      btn.appendChild(document.createTextNode('Delete'));
      actionTd.appendChild(btn);
      tr.appendChild(actionTd);

      dom.childDetailsTableBody.appendChild(tr);
    });
  }
  showModal(dom.childDetailsModal);
}


/* --------------------------------------------------------------------------
 * 8. Mutations (add child, add/delete contribution, members)
 * ----------------------------------------------------------------------- */

async function handleAddChildSubmit(e) {
  e.preventDefault();
  dom.addChildError.style.display = 'none';

  const name = $('childName').value.trim();
  const dob  = $('childBirthDate').value;
  if (!name || !dob) return;

  const birthYear = parseInt(dob.split('-')[0], 10);
  if (!birthYear || birthYear < 1900 || birthYear > 2100) {
    dom.addChildError.textContent = 'Please enter a valid date of birth.';
    dom.addChildError.style.display = 'block';
    return;
  }
  try {
    await db.collection('families').doc(state.currentFamilyId)
      .collection('children').add({ name, birthYear });
    resetAddChildForm();
  } catch (err) {
    dom.addChildError.textContent = err.message;
    dom.addChildError.style.display = 'block';
  }
}

async function handleContributeSubmit(e) {
  e.preventDefault();
  dom.contributeError.style.display = 'none';

  const childId        = dom.contribChildSelect.value;
  const contributorName = dom.contribNameInput.value.trim();
  const amountStr      = dom.contribAmountInput.value;
  const date           = dom.contribDateInput.value;
  const note           = dom.contribNoteInput.value.trim();
  const parsedAmount   = parseFloat(amountStr);

  try {
    const child = state.children.find(c => c.id === childId);
    if (!child) throw new Error('Selected child profile not found');

    const contributionYear = parseInt(date.split('-')[0], 10);
    const limY = limitYearForBirthYear(child.birthYear);

    if (contributionYear >= limY) {
      throw new Error(
        `Contributions must stop the calendar year the child turns 18. ` +
        `${child.name} turns 18 in ${limY}.`
      );
    }

    const childYearContribs = state.contributions.filter(
      c => c.childId === childId && c.year === contributionYear
    );
    const contributed = childYearContribs.reduce((sum, c) => sum + c.amount, 0);
    const remaining   = 5000 - contributed;

    if (parsedAmount > remaining) {
      throw new Error(
        `Contribution of ${formatMoney(parsedAmount)} exceeds the remaining ` +
        `${formatMoney(remaining)} limit for ${child.name} in ${contributionYear}.`
      );
    }

    await db.collection('families').doc(state.currentFamilyId)
      .collection('contributions').add({
        childId,
        contributorEmail: state.currentUserEmail,
        contributorName,
        amount: parsedAmount,
        date,
        year: contributionYear,
        note
      });

    hideModal(dom.contributeModal);
  } catch (err) {
    dom.contributeError.textContent = err.message;
    dom.contributeError.style.display = 'block';
  }
}

async function handleDeleteContribution(contribId) {
  if (!contribId) return;
  if (!confirm('Are you sure you want to delete this contribution?')) return;
  try {
    await db.collection('families').doc(state.currentFamilyId)
      .collection('contributions').doc(contribId).delete();
  } catch (err) {
    alert('Error deleting contribution: ' + err.message);
  }
}

async function handleDeleteChild(childId) {
  const child = state.children.find(c => c.id === childId);
  if (!child) return;
  const msg =
    `Are you sure you want to delete the profile for "${child.name}"?\n\n` +
    `WARNING: This will permanently delete all associated contributions! This action cannot be undone.`;
  if (!confirm(msg)) return;

  try {
    const familyRef = db.collection('families').doc(state.currentFamilyId);
    // Find all contributions for this child to cascade-delete.
    const cSnap = await familyRef.collection('contributions')
      .where('childId', '==', childId).get();
    const batch = db.batch();
    batch.delete(familyRef.collection('children').doc(childId));
    cSnap.forEach(d => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    alert('Error deleting child: ' + err.message);
  }
}

async function handleInviteMemberSubmit(e) {
  e.preventDefault();
  dom.inviteMemberError.style.display = 'none';
  const email = dom.inviteEmailInput.value.trim().toLowerCase();
  const role  = dom.inviteRoleSelect.value;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    dom.inviteMemberError.textContent = 'Enter a valid email address.';
    dom.inviteMemberError.style.display = 'block';
    return;
  }
  if (!['admin', 'viewer'].includes(role)) {
    dom.inviteMemberError.textContent = 'Invalid role selected.';
    dom.inviteMemberError.style.display = 'block';
    return;
  }
  if (state.familyData.members[email]) {
    dom.inviteMemberError.textContent = 'That email is already a member.';
    dom.inviteMemberError.style.display = 'block';
    return;
  }
  try {
    // Atomic: map set + array insert land in the same update() call.
    await db.collection('families').doc(state.currentFamilyId).update({
      ['members.' + email]: role,
      memberEmails: firebase.firestore.FieldValue.arrayUnion(email),
    });
    dom.inviteEmailInput.value = '';
    renderMembersList();
  } catch (err) {
    dom.inviteMemberError.textContent = err.message;
    dom.inviteMemberError.style.display = 'block';
  }
}

async function handleMemberRoleChange(email, newRole) {
  if (newRole === null) {
    // Remove from members. Atomic: map delete + array erase land together so
    // the routing index can never lag behind the membership map.
    try {
      await db.collection('families').doc(state.currentFamilyId).update({
        ['members.' + email]: firebase.firestore.FieldValue.delete(),
        memberEmails: firebase.firestore.FieldValue.arrayRemove(email),
      });
      renderMembersList();
    } catch (err) {
      alert('Error removing member: ' + err.message);
    }
    return;
  }
  // Demote/promote. Self-demotion is blocked both here and by the rules.
  if (email === state.currentUserEmail && newRole !== 'admin') {
    alert('You cannot change your own admin role. Ask another admin to do it.');
    return;
  }
  if (newRole === 'admin' && countAdmins() === 0) {
    alert('Cannot leave the family with no admins.');
    return;
  }
  try {
    await db.collection('families').doc(state.currentFamilyId)
      .update({ ['members.' + email]: newRole });
    renderMembersList();
  } catch (err) {
    alert('Error updating member: ' + err.message);
  }
}

function renderMembersList() {
  if (!state.familyData || !state.familyData.members) {
    dom.membersList.innerHTML = '';
    return;
  }
  dom.membersList.innerHTML = '';

  const members = Object.entries(state.familyData.members)
    .sort(([a], [b]) => a.localeCompare(b));

  const onlyOneAdmin = countAdmins() === 1;

  if (dom.lastAdminWarning) {
    if (onlyOneAdmin) {
      dom.lastAdminWarning.textContent =
        'This family has only one admin. Ask them to invite a second admin before demoting or removing them.';
      dom.lastAdminWarning.style.display = 'block';
    } else {
      dom.lastAdminWarning.style.display = 'none';
    }
  }

  members.forEach(([email, role]) => {
    const item = el('div', 'member-item');
    const info = el('div', 'member-info');
    info.appendChild(el('strong', null, email));
    const roleBadge = el('span', 'role-badge role-' + role, role);
    info.appendChild(roleBadge);
    item.appendChild(info);

    const actions = el('div', 'member-actions');
    if (email === state.currentUserEmail) {
      actions.appendChild(el('span', 'text-muted', '(you)'));
    } else {
      // Toggle role.
      const toggleBtn = el('button', 'btn btn-secondary btn-small');
      toggleBtn.dataset.action = 'toggle-member-role';
      toggleBtn.dataset.memberEmail = email;
      toggleBtn.textContent = role === 'admin' ? 'Demote to viewer' : 'Promote to admin';
      if (role === 'admin' && onlyOneAdmin) {
        toggleBtn.disabled = true;
        toggleBtn.title = 'Cannot demote the only admin.';
      }
      actions.appendChild(toggleBtn);

      // Remove from family.
      const removeBtn = el('button', 'btn-danger-link');
      removeBtn.dataset.action = 'remove-member';
      removeBtn.dataset.memberEmail = email;
      removeBtn.textContent = 'Remove';
      if (role === 'admin' && onlyOneAdmin) {
        removeBtn.disabled = true;
        removeBtn.title = 'Cannot remove the only admin.';
      }
      actions.appendChild(removeBtn);
    }
    item.appendChild(actions);

    dom.membersList.appendChild(item);
  });
}


/* --------------------------------------------------------------------------
 * 9. Event delegation wiring
 * ----------------------------------------------------------------------- */

function setupEventListeners() {
  // Existing buttons.
  dom.openContributeBtn.addEventListener('click', () => {
    if (!state.currentFamilyId) return;
    resetContributeForm();
    populateChildSelect();
    const today = new Date();
    const yyyy  = today.getFullYear();
    const mm    = String(today.getMonth() + 1).padStart(2, '0');
    const dd    = String(today.getDate()).padStart(2, '0');
    dom.contribDateInput.value = `${yyyy}-${mm}-${dd}`;
    showModal(dom.contributeModal);
  });

  dom.openManageChildrenBtn.addEventListener('click', () => {
    if (!state.currentFamilyId) return;
    resetAddChildForm();
    renderManageChildrenList();
    showModal(dom.manageChildrenModal);
  });

  if (dom.manageMembersBtn) {
    dom.manageMembersBtn.addEventListener('click', () => {
      if (!state.familyData) return;
      dom.inviteMemberError.style.display = 'none';
      dom.inviteEmailInput.value = '';
      renderMembersList();
      showModal(dom.manageMembersModal);
    });
  }

  if (dom.signOutBtn) {
    dom.signOutBtn.addEventListener('click', signOutAndReroute);
  }

  // Modal close delegation (existing markup).
  document.addEventListener('click', (e) => {
    const closer = e.target.closest('.close-modal-btn, .cancel-btn');
    if (closer) {
      const overlay = closer.closest('.modal-overlay');
      if (overlay) {
        overlay.style.display = 'none';
        if (overlay.id === 'childDetailsModal') activeDetailedChildId = null;
      }
      return;
    }
    if (e.target.classList && e.target.classList.contains('modal-overlay')) {
      e.target.style.display = 'none';
      if (e.target.id === 'childDetailsModal') activeDetailedChildId = null;
    }
  });

  // Form submissions.
  dom.contributeForm.addEventListener('submit', handleContributeSubmit);
  dom.addChildForm.addEventListener('submit', handleAddChildSubmit);
  dom.createFamilyForm.addEventListener('submit', handleCreateFamilySubmit);
  dom.inviteMemberForm.addEventListener('submit', handleInviteMemberSubmit);

  // Live validation.
  dom.contribChildSelect.addEventListener('change', updateLiveValidation);
  dom.contribAmountInput.addEventListener('input', updateLiveValidation);
  dom.contribDateInput.addEventListener('input', updateLiveValidation);

  // Delegated delete handlers.
  dom.activityTableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="delete-contribution"]');
    if (btn) handleDeleteContribution(btn.dataset.contribId);
  });
  dom.childDetailsTableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="delete-contribution"]');
    if (btn) handleDeleteContribution(btn.dataset.contribId);
  });
  dom.childrenList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="delete-child"]');
    if (btn) handleDeleteChild(btn.dataset.childId);
  });
  dom.childrenGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.child-card');
    if (card && card.dataset.childId) openChildDetails(card.dataset.childId);
  });

  // Members list toggles.
  dom.membersList.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('button[data-action="toggle-member-role"]');
    if (toggleBtn) {
      const email = toggleBtn.dataset.memberEmail;
      const currentRole = state.familyData.members[email];
      const newRole = currentRole === 'admin' ? 'viewer' : 'admin';
      handleMemberRoleChange(email, newRole);
      return;
    }
    const removeBtn = e.target.closest('button[data-action="remove-member"]');
    if (removeBtn) {
      const email = removeBtn.dataset.memberEmail;
      if (!confirm(`Remove ${email} from this family?`)) return;
      handleMemberRoleChange(email, null);
    }
  });
}


/* --------------------------------------------------------------------------
 * 10. Bootstrap
 * ----------------------------------------------------------------------- */

window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();

  // If we arrived via the magic link, complete the sign-in first. Otherwise,
  // onAuthStateChanged will pick up any existing session.
  if (auth.isSignInWithEmailLink(window.location.href)) {
    completeEmailLinkSignIn();
  }

  auth.onAuthStateChanged((user) => {
    if (user && user.email) {
      routeToFamily(user);
    } else {
      clearListeners();
      showAuth_emailEntry();
    }
  });
});
