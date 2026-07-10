// Check if Firebase configuration is present
if (!window.firebaseConfig || window.firebaseConfig.apiKey === "YOUR_API_KEY") {
  // Show gorgeous setup instructions on page if config is not configured
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
          <li>Make sure you enable <strong>Cloud Firestore</strong> database in the Firebase project console and start it in <strong>Test Mode</strong> (public access).</li>
        </ol>
        <p style="font-size: 13px; color: var(--color-accent); font-weight: 600;">After saving the config.js file, simply refresh this page!</p>
      </div>
    `;
    
    // Disable primary action buttons on the header/dashboard
    const actionBtns = document.querySelector('.action-buttons');
    if (actionBtns) actionBtns.style.display = 'none';
  });
  throw new Error("Firebase Configuration Missing. Please rename config.example.js to config.js and insert your API keys.");
}

// Initialize Firebase and Firestore
firebase.initializeApp(window.firebaseConfig);
const db = firebase.firestore();

// App state
let state = {
  children: [],
  contributions: [],
  selectedYear: new Date().getFullYear()
};

// DOM Elements
const yearSelect = document.getElementById('yearSelect');
const summaryYear = document.getElementById('summaryYear');
const summaryTotal = document.getElementById('summaryTotal');
const summaryRemaining = document.getElementById('summaryRemaining');
const summaryProgressBar = document.getElementById('summaryProgressBar');
const summaryChildrenCount = document.getElementById('summaryChildrenCount');
const summaryPercentage = document.getElementById('summaryPercentage');
const childrenGrid = document.getElementById('childrenGrid');
const activityTableBody = document.getElementById('activityTableBody');
const noActivityMessage = document.getElementById('noActivityMessage');

// Modals
const contributeModal = document.getElementById('contributeModal');
const manageChildrenModal = document.getElementById('manageChildrenModal');
const childDetailsModal = document.getElementById('childDetailsModal');

// Buttons & Forms
const openContributeBtn = document.getElementById('openContributeBtn');
const openManageChildrenBtn = document.getElementById('openManageChildrenBtn');
const contributeForm = document.getElementById('contributeForm');
const addChildForm = document.getElementById('addChildForm');

// Modal Elements
const contribChildSelect = document.getElementById('contribChild');
const contribNameInput = document.getElementById('contribName');
const contribAmountInput = document.getElementById('contribAmount');
const contribDateInput = document.getElementById('contribDate');
const contribNoteInput = document.getElementById('contribNote');
const liveLimitMessage = document.getElementById('liveLimitMessage');
const contributeError = document.getElementById('contributeError');
const addChildError = document.getElementById('addChildError');
const childrenList = document.getElementById('childrenList');

// Child Details Modal Elements
const childDetailsTitle = document.getElementById('childDetailsTitle');
const childDetailsDob = document.getElementById('childDetailsDob');
const childDetailsAge = document.getElementById('childDetailsAge');
const childDetailsYear = document.getElementById('childDetailsYear');
const childDetailsLimitStatus = document.getElementById('childDetailsLimitStatus');
const childDetailsTableBody = document.getElementById('childDetailsTableBody');
const noChildDetailsMessage = document.getElementById('noChildDetailsMessage');
const childDetailsListYear = document.getElementById('childDetailsListYear');

// Selected Child ID for detailed view
let activeDetailedChildId = null;

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
  setupYearDropdown();
  setupEventListeners();
  setupRealtimeListeners();
});

// Helper: Setup Year Dropdown
function setupYearDropdown() {
  const currentYear = new Date().getFullYear();
  const selectYears = [];
  for (let y = currentYear - 2; y <= currentYear + 5; y++) {
    selectYears.push(y);
  }
  
  yearSelect.innerHTML = selectYears
    .map(y => `<option value="${y}">${y}</option>`)
    .join('');
  
  yearSelect.value = state.selectedYear;
  
  yearSelect.addEventListener('change', (e) => {
    state.selectedYear = parseInt(e.target.value, 10);
    render();
    if (activeDetailedChildId && childDetailsModal.style.display === 'flex') {
      openChildDetails(activeDetailedChildId);
    }
  });
}

// Helper: Setup Event Listeners
function setupEventListeners() {
  openContributeBtn.addEventListener('click', () => {
    resetContributeForm();
    populateChildSelect();
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    contribDateInput.value = `${yyyy}-${mm}-${dd}`;
    contributeModal.style.display = 'flex';
  });

  openManageChildrenBtn.addEventListener('click', () => {
    resetAddChildForm();
    renderManageChildrenList();
    manageChildrenModal.style.display = 'flex';
  });

  document.querySelectorAll('.close-modal-btn, .cancel-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.target.closest('.modal-overlay').style.display = 'none';
      if (e.target.closest('#childDetailsModal')) {
        activeDetailedChildId = null;
      }
    });
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.style.display = 'none';
      if (e.target.id === 'childDetailsModal') {
        activeDetailedChildId = null;
      }
    }
  });

  contributeForm.addEventListener('submit', handleContributeSubmit);
  addChildForm.addEventListener('submit', handleAddChildSubmit);

  contribChildSelect.addEventListener('change', updateLiveValidation);
  contribAmountInput.addEventListener('input', updateLiveValidation);
  contribDateInput.addEventListener('input', updateLiveValidation);
}

// Set up real-time Firebase listeners
function setupRealtimeListeners() {
  // Listen for children collection changes
  db.collection('children').onSnapshot(
    (snapshot) => {
      state.children = [];
      snapshot.forEach((doc) => {
        state.children.push({ id: doc.id, ...doc.data() });
      });
      render();
      if (activeDetailedChildId) {
        openChildDetails(activeDetailedChildId);
      }
      renderManageChildrenList();
      populateChildSelect();
    },
    (error) => {
      console.error("Firestore Children listener error:", error);
    }
  );

  // Listen for contributions collection changes
  db.collection('contributions').onSnapshot(
    (snapshot) => {
      state.contributions = [];
      snapshot.forEach((doc) => {
        state.contributions.push({ id: doc.id, ...doc.data() });
      });
      updateYearDropdownWithOptions();
      render();
      if (activeDetailedChildId) {
        openChildDetails(activeDetailedChildId);
      }
    },
    (error) => {
      console.error("Firestore Contributions listener error:", error);
    }
  );
}

// Dynamically add years to dropdown if database contains entries outside default range
function updateYearDropdownWithOptions() {
  const currentOptions = Array.from(yearSelect.options).map(o => parseInt(o.value, 10));
  const contributionYears = state.contributions.map(c => parseInt(c.date.split('-')[0], 10));
  
  let updated = false;
  contributionYears.forEach(year => {
    if (!currentOptions.includes(year)) {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      yearSelect.appendChild(option);
      updated = true;
    }
  });
  
  if (updated) {
    const options = Array.from(yearSelect.options);
    options.sort((a, b) => parseInt(a.value, 10) - parseInt(b.value, 10));
    yearSelect.innerHTML = '';
    options.forEach(opt => yearSelect.add(opt));
    yearSelect.value = state.selectedYear;
  }
}

// Calculate precise age
function calculateAge(birthDateStr) {
  const birthDate = new Date(birthDateStr);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// Render Dashboard components
function render() {
  renderSummary();
  renderChildrenGrid();
  renderActivityFeed();
}

// Render Summary card
function renderSummary() {
  summaryYear.textContent = state.selectedYear;
  
  const yearContribs = state.contributions.filter(
    c => parseInt(c.date.split('-')[0], 10) === state.selectedYear
  );

  const total = yearContribs.reduce((sum, c) => sum + c.amount, 0);
  
  let activeChildrenCount = 0;
  let maxPossibleContributions = 0;
  let currentActiveTotal = 0;

  state.children.forEach(child => {
    const birthYear = parseInt(child.birthDate.split('-')[0], 10);
    const limitYear = birthYear + 18;
    
    if (state.selectedYear < limitYear) {
      activeChildrenCount++;
      maxPossibleContributions += 5000;
      
      const childContribs = yearContribs.filter(c => c.childId === child.id);
      currentActiveTotal += childContribs.reduce((sum, c) => sum + c.amount, 0);
    }
  });

  const remaining = maxPossibleContributions - currentActiveTotal;
  
  summaryTotal.textContent = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  summaryRemaining.textContent = `$${(remaining > 0 ? remaining : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} left`;
  
  summaryChildrenCount.textContent = `${state.children.length} total profile${state.children.length === 1 ? '' : 's'} (${activeChildrenCount} eligible in ${state.selectedYear})`;
  
  const percent = maxPossibleContributions > 0 ? Math.min((currentActiveTotal / maxPossibleContributions) * 100, 100) : 0;
  summaryProgressBar.style.width = `${percent}%`;
  summaryPercentage.textContent = `${percent.toFixed(1)}% of max eligible limit reached`;
}

// Render Grid of Children
function renderChildrenGrid() {
  childrenGrid.innerHTML = '';
  
  if (state.children.length === 0) {
    childrenGrid.innerHTML = `
      <div class="card glass text-center" style="grid-column: 1 / -1; padding: 40px;">
        <p style="color: var(--text-secondary); margin-bottom: 16px;">No children profiles created yet.</p>
        <button onclick="openManageChildrenBtn.click()" class="btn btn-secondary">
          Add a Child Profile
        </button>
      </div>
    `;
    return;
  }

  state.children.forEach(child => {
    const birthYear = parseInt(child.birthDate.split('-')[0], 10);
    const limitYear = birthYear + 18;
    const isOverAge = state.selectedYear >= limitYear;
    
    const childYearContribs = state.contributions.filter(
      c => c.childId === child.id && parseInt(c.date.split('-')[0], 10) === state.selectedYear
    );
    const contributed = childYearContribs.reduce((sum, c) => sum + c.amount, 0);
    const remaining = 5000 - contributed;
    const progressPercent = Math.min((contributed / 5000) * 100, 100);
    
    const currentAge = calculateAge(child.birthDate);
    const cardClass = isOverAge ? 'child-card card glass card-inactive' : 'child-card card glass';
    const badgeClass = isOverAge ? 'child-age-badge badge-inactive' : 'child-age-badge';
    
    let statusText = '';
    if (isOverAge) {
      statusText = `<span style="color: var(--color-danger); font-weight:600;">Stopped (Turns 18)</span>`;
    } else if (contributed >= 5000) {
      statusText = `<span style="color: var(--color-primary); font-weight:600;">Maxed Out</span>`;
    } else {
      statusText = `<span style="color: var(--text-secondary);">${((contributed/5000)*100).toFixed(0)}% Fill</span>`;
    }

    const card = document.createElement('div');
    card.className = cardClass;
    card.innerHTML = `
      <div class="child-card-header">
        <div class="child-card-title">
          <h3>${escapeHTML(child.name)}</h3>
          <p>Born: ${child.birthDate} • Turns 18 in ${limitYear}</p>
        </div>
        <div class="${badgeClass}">Age ${currentAge}</div>
      </div>
      
      <div class="child-limit-progress">
        <div class="child-progress-text">
          <span class="limit">${statusText}</span>
          <span class="amount">$${contributed.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span class="limit">/ $5,000</span></span>
        </div>
        <div class="progress-bar-container" style="height: 8px;">
          <div class="progress-bar-fill" style="width: ${isOverAge ? 0 : progressPercent}%; background: ${contributed >= 5000 ? 'var(--color-primary)' : 'var(--color-secondary)'};"></div>
        </div>
      </div>
      
      <div class="child-card-footer">
        <span>${isOverAge ? 'No contribution allowed' : 'Remaining limit:'}</span>
        <span class="remaining-value">${isOverAge ? '$0.00' : '$' + remaining.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
      </div>
    `;
    
    card.addEventListener('click', () => openChildDetails(child.id));
    childrenGrid.appendChild(card);
  });
}

// Render Recent Activity Feed
function renderActivityFeed() {
  activityTableBody.innerHTML = '';
  
  const yearContribs = state.contributions.filter(
    c => parseInt(c.date.split('-')[0], 10) === state.selectedYear
  );
  
  yearContribs.sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return b.id.localeCompare(a.id);
  });

  if (yearContribs.length === 0) {
    noActivityMessage.style.display = 'block';
    return;
  }
  
  noActivityMessage.style.display = 'none';

  yearContribs.forEach(contrib => {
    const child = state.children.find(c => c.id === contrib.childId);
    const childName = child ? child.name : 'Unknown Child';
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${contrib.date}</td>
      <td class="table-child-name">${escapeHTML(childName)}</td>
      <td>${escapeHTML(contrib.contributorName)}</td>
      <td class="table-amount">$${contrib.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td><span style="color: var(--text-secondary); font-size: 13px;">${escapeHTML(contrib.note || '—')}</span></td>
      <td>
        <button class="btn-danger-link" onclick="handleDeleteContribution(event, '${contrib.id}')">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          Delete
        </button>
      </td>
    `;
    activityTableBody.appendChild(row);
  });
}

// Populate children in contribute form select
function populateChildSelect() {
  contribChildSelect.innerHTML = '<option value="" disabled selected>Select child...</option>';
  const sortedChildren = [...state.children].sort((a, b) => a.name.localeCompare(b.name));
  
  sortedChildren.forEach(child => {
    const birthYear = parseInt(child.birthDate.split('-')[0], 10);
    const limitYear = birthYear + 18;
    const isOverAgeInSelected = state.selectedYear >= limitYear;
    
    let suffix = '';
    if (isOverAgeInSelected) {
      suffix = ` (Stopped - Turns 18 in ${limitYear})`;
    }
    
    const option = document.createElement('option');
    option.value = child.id;
    option.textContent = `${child.name}${suffix}`;
    if (isOverAgeInSelected) {
      option.style.color = 'var(--text-muted)';
    }
    contribChildSelect.appendChild(option);
  });
}

// Live form validation
function updateLiveValidation() {
  const childId = contribChildSelect.value;
  const amountStr = contribAmountInput.value;
  const dateStr = contribDateInput.value;
  
  if (!childId) {
    liveLimitMessage.textContent = 'Select a child to view remaining limit.';
    liveLimitMessage.className = 'form-help-text';
    enableSubmitButton(true);
    return;
  }

  const child = state.children.find(c => c.id === childId);
  if (!child) return;

  const amount = parseFloat(amountStr);
  const dateYear = dateStr ? parseInt(dateStr.split('-')[0], 10) : state.selectedYear;
  
  const birthYear = parseInt(child.birthDate.split('-')[0], 10);
  const limitYear = birthYear + 18;

  if (dateYear >= limitYear) {
    liveLimitMessage.textContent = `Contributions blocked. ${child.name} turns 18 in ${limitYear}, so contributions stop for ${dateYear}.`;
    liveLimitMessage.className = 'form-help-text text-danger';
    enableSubmitButton(false);
    return;
  }

  const childYearContribs = state.contributions.filter(
    c => c.childId === childId && parseInt(c.date.split('-')[0], 10) === dateYear
  );
  const contributed = childYearContribs.reduce((sum, c) => sum + c.amount, 0);
  const remaining = 5000 - contributed;

  if (isNaN(amount) || amount <= 0) {
    liveLimitMessage.textContent = `Limit for ${child.name} in ${dateYear}: $${remaining.toLocaleString('en-US', { minimumFractionDigits: 2 })} remaining.`;
    liveLimitMessage.className = 'form-help-text';
    enableSubmitButton(true);
  } else if (amount > remaining) {
    liveLimitMessage.textContent = `Error: Contribution of $${amount.toFixed(2)} exceeds the remaining limit of $${remaining.toFixed(2)}.`;
    liveLimitMessage.className = 'form-help-text text-danger';
    enableSubmitButton(false);
  } else {
    const afterContrib = remaining - amount;
    liveLimitMessage.textContent = `Valid contribution! $${afterContrib.toFixed(2)} will remain of the yearly limit.`;
    liveLimitMessage.className = 'form-help-text text-success';
    enableSubmitButton(true);
  }
}

function enableSubmitButton(enable) {
  const submitBtn = contributeForm.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = !enable;
    submitBtn.style.opacity = enable ? '1' : '0.5';
    submitBtn.style.cursor = enable ? 'pointer' : 'not-allowed';
  }
}

function resetContributeForm() {
  contributeForm.reset();
  contributeError.style.display = 'none';
  liveLimitMessage.textContent = '';
  liveLimitMessage.className = 'form-help-text';
  enableSubmitButton(true);
}

function resetAddChildForm() {
  addChildForm.reset();
  addChildError.style.display = 'none';
}

// Add child profile to Cloud Firestore
async function handleAddChildSubmit(e) {
  e.preventDefault();
  addChildError.style.display = 'none';

  const name = document.getElementById('childName').value.trim();
  const birthDate = document.getElementById('childBirthDate').value;

  try {
    await db.collection('children').add({
      name: name,
      birthDate: birthDate
    });
    resetAddChildForm();
  } catch (error) {
    addChildError.textContent = error.message;
    addChildError.style.display = 'block';
  }
}

// Log contribution to Cloud Firestore
async function handleContributeSubmit(e) {
  e.preventDefault();
  contributeError.style.display = 'none';

  const childId = contribChildSelect.value;
  const contributorName = contribNameInput.value;
  const amount = contribAmountInput.value;
  const date = contribDateInput.value;
  const note = contribNoteInput.value;

  try {
    const child = state.children.find(c => c.id === childId);
    if (!child) throw new Error('Selected child profile not found');

    const birthYear = parseInt(child.birthDate.split('-')[0], 10);
    const contributionYear = parseInt(date.split('-')[0], 10);
    const limitYear = birthYear + 18;

    // Age constraint check
    if (contributionYear >= limitYear) {
      throw new Error(`Contributions must stop the calendar year the child turns 18. ${child.name} turns 18 in ${limitYear}.`);
    }

    // Limit check
    const childYearContribs = state.contributions.filter(
      c => c.childId === childId && parseInt(c.date.split('-')[0], 10) === contributionYear
    );
    const contributed = childYearContribs.reduce((sum, c) => sum + c.amount, 0);
    const remaining = 5000 - contributed;
    const parsedAmount = parseFloat(amount);

    if (parsedAmount > remaining) {
      throw new Error(`Contribution of $${parsedAmount.toFixed(2)} exceeds the remaining $${remaining.toFixed(2)} limit for ${child.name} in ${contributionYear}.`);
    }

    await db.collection('contributions').add({
      childId,
      contributorName: contributorName.trim(),
      amount: parsedAmount,
      date,
      note: note ? note.trim() : ''
    });

    contributeModal.style.display = 'none';
  } catch (error) {
    contributeError.textContent = error.message;
    contributeError.style.display = 'block';
  }
}

// Delete contribution from Cloud Firestore
async function handleDeleteContribution(e, id) {
  e.stopPropagation();
  if (!confirm('Are you sure you want to delete this contribution?')) return;

  try {
    await db.collection('contributions').doc(id).delete();
  } catch (error) {
    alert("Error deleting contribution: " + error.message);
  }
}

// Render list in children manager modal
function renderManageChildrenList() {
  childrenList.innerHTML = '';
  if (state.children.length === 0) {
    childrenList.innerHTML = '<p style="font-size: 13px; color: var(--text-secondary); text-align:center; padding: 20px;">No profiles yet.</p>';
    return;
  }

  const sorted = [...state.children].sort((a, b) => a.name.localeCompare(b.name));

  sorted.forEach(child => {
    const item = document.createElement('div');
    item.className = 'profile-item';
    item.innerHTML = `
      <div class="profile-item-info">
        <h4>${escapeHTML(child.name)}</h4>
        <p>DOB: ${child.birthDate}</p>
      </div>
      <button class="btn-danger-link" onclick="handleDeleteChild('${child.id}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        Delete
      </button>
    `;
    childrenList.appendChild(item);
  });
}

// Delete child and all their contributions using Firestore batch write
async function handleDeleteChild(id) {
  const child = state.children.find(c => c.id === id);
  if (!child) return;

  const msg = `Are you sure you want to delete the profile for "${child.name}"?\n\nWARNING: This will permanently delete all associated contributions! This action cannot be undone.`;
  if (!confirm(msg)) return;

  try {
    const batch = db.batch();
    const childRef = db.collection('children').doc(id);
    batch.delete(childRef);

    const snapshot = await db.collection('contributions').where('childId', '==', id).get();
    snapshot.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  } catch (error) {
    alert("Error deleting child: " + error.message);
  }
}

// Open Child contribution history modal
function openChildDetails(childId) {
  const child = state.children.find(c => c.id === childId);
  if (!child) return;

  activeDetailedChildId = childId;
  
  childDetailsTitle.textContent = `${child.name}'s Account History`;
  childDetailsDob.textContent = child.birthDate;
  childDetailsAge.textContent = `${calculateAge(child.birthDate)} years`;
  childDetailsYear.textContent = state.selectedYear;
  childDetailsListYear.textContent = state.selectedYear;

  const childContribs = state.contributions.filter(
    c => c.childId === childId && parseInt(c.date.split('-')[0], 10) === state.selectedYear
  );
  
  const total = childContribs.reduce((sum, c) => sum + c.amount, 0);
  childDetailsLimitStatus.textContent = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })} / $5,000.00`;

  childDetailsTableBody.innerHTML = '';
  
  if (childContribs.length === 0) {
    noChildDetailsMessage.style.display = 'block';
  } else {
    noChildDetailsMessage.style.display = 'none';
    childContribs.sort((a, b) => b.date.localeCompare(a.date));

    childContribs.forEach(contrib => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${contrib.date}</td>
        <td>${escapeHTML(contrib.contributorName)}</td>
        <td class="table-amount">$${contrib.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td><span style="color: var(--text-secondary); font-size: 13px;">${escapeHTML(contrib.note || '—')}</span></td>
        <td>
          <button class="btn-danger-link" onclick="handleDeleteContribution(event, '${contrib.id}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            Delete
          </button>
        </td>
      `;
      childDetailsTableBody.appendChild(row);
    });
  }

  childDetailsModal.style.display = 'flex';
}

// Helper: Escape HTML strings
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
