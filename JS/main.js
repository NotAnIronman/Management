// main.js
import {
  data,
  startOfWeek,
  pickUnusedColor,
  loadFromLocalStorage,
  scheduleSave,
  buildSharePayload,
  encodeSharePayload,
  tryLoadFromHash,
  getCurrentWeekKey,
  getAssignmentsForWeek,
  totalHoursForEmployeeWeek
} from './data.js';
import {
  renderWeekLabel,
  forceChartUpdate
} from './charts.js';
import {
  renderJobs,
  renderEmployees,
  addJob,
  addEmployee,
  showToast,
  makeResizable
} from './ui.js';

// renderAll
export function renderAll() {
  renderWeekLabel();
  renderJobs();
  renderEmployees();
  forceChartUpdate();
  scheduleSave();
}

// dark mode + settings + file menu wiring stays here or in ui.js if you prefer

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('jobColorInput').value = pickUnusedColor();
});

// week nav
document.getElementById('prevWeekBtn').addEventListener('click', () => {
  data.currentWeekStart.setDate(data.currentWeekStart.getDate() - 7);
  renderAll();
});
document.getElementById('nextWeekBtn').addEventListener('click', () => {
  data.currentWeekStart.setDate(data.currentWeekStart.getDate() + 7);
  renderAll();
});
document.getElementById('jumpToPresentBtn').addEventListener('click', () => {
  data.currentWeekStart = startOfWeek(new Date());
  renderAll();
});

// add job / employee
document.getElementById('addJobBtn').addEventListener('click', () => {
  const nameInput = document.getElementById('jobNameInput');
  const categoryInput = document.getElementById('jobCategoryInput');
  const colorInput = document.getElementById('jobColorInput');
  addJob(nameInput.value, categoryInput.value, colorInput.value);
  nameInput.value = '';
});

document.getElementById('jobNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const nameInput = document.getElementById('jobNameInput');
    const categoryInput = document.getElementById('jobCategoryInput');
    const colorInput = document.getElementById('jobColorInput');
    addJob(nameInput.value, categoryInput.value, colorInput.value);
    nameInput.value = '';
  }
});

document.getElementById('addEmployeeBtn').addEventListener('click', () => {
  const nameInput = document.getElementById('employeeNameInput');
  const budgetInput = document.getElementById('employeeBudgetInput');
  const districtInput = document.getElementById('employeeDistrictInput');
  addEmployee(nameInput.value, budgetInput.value, districtInput.value);
  nameInput.value = '';
  budgetInput.value = '';
});

document.getElementById('employeeNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const nameInput = document.getElementById('employeeNameInput');
    const budgetInput = document.getElementById('employeeBudgetInput');
    const districtInput = document.getElementById('employeeDistrictInput');
    addEmployee(nameInput.value, budgetInput.value, districtInput.value);
    nameInput.value = '';
    budgetInput.value = '';
  }
});

// share link button
document.getElementById('copyShareLinkBtn').addEventListener('click', () => {
  try {
    const payload = buildSharePayload();
    const encoded = encodeSharePayload(payload);
    const url = `${location.href.split('#')[0]}#data=${encoded}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        showToast('✓ Share link copied to clipboard!');
      }).catch(() => fallbackCopyShareLink(url));
    } else {
      fallbackCopyShareLink(url);
    }
  } catch (e) {
    showToast('⚠ Could not generate share link (data may be too large).');
    console.error(e);
  }
});

function fallbackCopyShareLink(url) {
  const ta = document.createElement('textarea');
  ta.value = url;
  ta.style.cssText = 'position:fixed;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast('✓ Share link copied to clipboard!');
}

// CSV + JSON export/import wiring can also live here, calling helpers in ui/data

// startup
if (!tryLoadFromHash(showToast)) {
  loadFromLocalStorage();
}
renderAll();

// resizable columns
makeResizable(
  document.getElementById('divider1'),
  document.querySelector('.chart-column'),
  document.querySelector('.jobs-column')
);
makeResizable(
  document.getElementById('divider2'),
  document.querySelector('.jobs-column'),
  document.querySelector('.employees-column')
);
