// Estimation Management Planner - script.js
// -----------------------------------------------------------
// This file handles all of the behavior for the planner:
// - Managing weeks
// - Adding jobs and employees
// - Dragging jobs onto employees
// - Tracking hours and subtasks
// - Drawing the project allocation chart
// - Importing / exporting data
// - Resizing the three main columns

// ---------- Constants ----------

const DEFAULT_COLOR = '#03bafc';
const DEFAULT_DISTRICT = 'Electrical';

// ---------- Basic helpers for dates and IDs ----------

// Create a unique ID for jobs and employees
function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback (not a full UUID v4, but good enough if crypto.randomUUID is unavailable)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Get the Monday of the week for a given date
function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Format a date as YYYY-MM-DD in local time
function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get a key that represents the week (based on Monday)
function getWeekKey(date) {
  return formatDate(startOfWeek(date));
}

// ---------- Main data model ----------

// This object holds everything the app needs to remember.
const data = {
  employees: [],          // List of employees
  jobs: [],               // List of jobs
  assignments: {},        // assignments[weekKey][employeeId][jobId] = { hours, subtasks }
  currentWeekStart: startOfWeek(new Date()) // The week we are currently viewing
};

// ---------- DOM references ----------

const weekLabelEl = document.getElementById('weekLabel');
const jobsListEl = document.getElementById('jobsList');
const employeesListEl = document.getElementById('employeesList');
const chartHeaderLineEl = document.getElementById('chartHeaderLine');
const chartLegendEl = document.getElementById('chartLegend');
const projectChartCanvas = document.getElementById('projectChart');

// ---------- Week helpers ----------

// Get the current week key based on data.currentWeekStart
function getCurrentWeekKey() {
  return getWeekKey(data.currentWeekStart);
}

// Make sure we always have a week object in data.assignments
function getAssignmentsForWeek(weekKey) {
  if (!data.assignments[weekKey]) data.assignments[weekKey] = {};
  return data.assignments[weekKey];
}

// Make sure we always have an employee object for a given week
function getEmployeeAssignmentsForWeek(weekKey, employeeId) {
  const week = getAssignmentsForWeek(weekKey);
  if (!week[employeeId]) week[employeeId] = {};
  return week[employeeId];
}

// ---------- Hours calculations ----------

// Only the parent job hours count toward total hours for an employee
function totalHoursForEmployeeWeek(weekKey, employeeId) {
  const empAssignments = getEmployeeAssignmentsForWeek(weekKey, employeeId);
  let sum = 0;
  Object.values(empAssignments).forEach(a => {
    sum += (a.hours || 0);
  });
  return sum;
}

// Sum of all hours across all employees for the current week
function totalHoursAllEmployees(weekKey) {
  return data.employees.reduce((sum, emp) => {
    return sum + totalHoursForEmployeeWeek(weekKey, emp.id);
  }, 0);
}

// Total capacity is the sum of all employee weekly budgets
function totalEmployeeCapacity() {
  return data.employees.reduce((sum, emp) => sum + (emp.weeklyBudget || 0), 0);
}

// ---------- Rendering helpers ----------

// Small helper to re-draw the chart after changes.
// Using requestAnimationFrame to sync with the browser's paint cycle.
function forceChartUpdate() {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(renderProjectChart);
  } else {
    setTimeout(renderProjectChart, 30);
  }
}

// Show the current week range in the header
function renderWeekLabel() {
  const start = data.currentWeekStart;
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  weekLabelEl.textContent = `${formatDate(start)} to ${formatDate(end)}`;
}

// ---------- Jobs rendering ----------

function renderJobs() {
  jobsListEl.innerHTML = '';

  const categories = ['Active', 'Upcoming', 'Complete', 'Other'];
  const subCategories = ['Electrical', 'Instrumentation', 'Other'];

  categories.forEach(cat => {
    // Each category (Active, Upcoming, Complete) gets its own section
    const section = document.createElement('div');
    section.className = 'job-category-section';

    // Header that can collapse the whole category list
    const header = document.createElement('div');
    header.className = 'job-category-header';
    header.textContent = cat;
    header.onclick = () => section.classList.toggle('collapsed');

    const list = document.createElement('div');
    list.className = 'job-category-list';

    const jobsInCat = data.jobs.filter(j => j.category === cat);

    jobsInCat.forEach(job => {
      const div = document.createElement('div');
      div.className = 'item';
      div.draggable = true;
      div.dataset.jobId = job.id;

      // If job has a collapsed flag, apply it
      if (job.collapsed) {
        div.classList.add('collapsed');
      }

      // Top row of the job (name, color, category, buttons)
      const headerRow = document.createElement('div');
      headerRow.className = 'item-header-row';

      const colorBox = document.createElement('div');
      colorBox.className = 'legend-color';
      colorBox.style.background = job.color || DEFAULT_COLOR;

      const span = document.createElement('span');
      span.textContent = job.name;

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = job.color || DEFAULT_COLOR;
      colorInput.onchange = () => {
        job.color = colorInput.value;
        renderJobs();
        forceChartUpdate();
      };

      const categorySelect = document.createElement('select');
      ['Active', 'Upcoming', 'Complete', 'Other'].forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        if (job.category === c) opt.selected = true;
        categorySelect.appendChild(opt);
      });
      categorySelect.onchange = () => {
        job.category = categorySelect.value;
        renderJobs();
        forceChartUpdate();
      };

      // Toggle button hides/shows the subtask area only
      const collapseBtn = document.createElement('button');
      collapseBtn.textContent = 'Toggle';
      collapseBtn.onclick = () => {
        job.collapsed = !job.collapsed;
        div.classList.toggle('collapsed');
      };

      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'X';
      removeBtn.onclick = () => {
        removeJob(job.id);
      };

      headerRow.appendChild(colorBox);
      headerRow.appendChild(span);
      headerRow.appendChild(colorInput);
      headerRow.appendChild(categorySelect);
      headerRow.appendChild(collapseBtn);
      headerRow.appendChild(removeBtn);

      div.appendChild(headerRow);

      // Subtasks container for this job
      const subtasksContainer = document.createElement('div');
      subtasksContainer.className = 'job-subtasks';

      // Each job has subtasks grouped by category (Electrical, Instrumentation, Other)
      subCategories.forEach(subCat => {
        const catBlock = document.createElement('div');
        catBlock.className = 'job-subtask-category';

        const catHeader = document.createElement('div');
        catHeader.className = 'job-subtask-category-header';
        catHeader.textContent = subCat;
        catHeader.onclick = () => catBlock.classList.toggle('collapsed');

        const items = document.createElement('div');
        items.className = 'job-subtask-items';

        const jobSubtasks = job.subtasks || [];

        // Existing subtasks for this category
        jobSubtasks
          .filter(st => st.category === subCat)
          .forEach(st => {
            const row = document.createElement('div');
            row.className = 'job-subtask-row';

            // Dot to visually mark subtasks
            const dot = document.createElement('span');
            dot.textContent = '•';
            dot.style.width = '1px';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = st.name;

            const stColorInput = document.createElement('input');
            stColorInput.type = 'color';
            stColorInput.value = st.color || job.color || DEFAULT_COLOR;
            stColorInput.onchange = () => {
              st.color = stColorInput.value;
              renderJobs();
            };

            const delBtn = document.createElement('button');
            delBtn.textContent = 'X';
            delBtn.onclick = () => {
              const index = jobSubtasks.indexOf(st);
              if (index >= 0) jobSubtasks.splice(index, 1);
              renderJobs();
            };

            row.appendChild(dot);
            row.appendChild(nameSpan);
            row.appendChild(stColorInput);
            row.appendChild(delBtn);
            items.appendChild(row);
          });

        // Row to add a new subtask under this category
        const addRow = document.createElement('div');
        addRow.className = 'job-subtask-add';

        const nameInput = document.createElement('input');
        nameInput.placeholder = 'Subtask name';

        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.value = job.color || DEFAULT_COLOR;

        const addBtn = document.createElement('button');
        addBtn.textContent = 'Add';
        addBtn.onclick = () => {
          if (!nameInput.value.trim()) return;
          job.subtasks = job.subtasks || [];
          job.subtasks.push({
            name: nameInput.value.trim(),
            category: subCat,
            color: colorPicker.value
          });
          nameInput.value = '';
          renderJobs();
        };

        addRow.appendChild(nameInput);
        addRow.appendChild(colorPicker);
        addRow.appendChild(addBtn);

        catBlock.appendChild(catHeader);
        catBlock.appendChild(items);
        catBlock.appendChild(addRow);

        subtasksContainer.appendChild(catBlock);
      });

      div.appendChild(subtasksContainer);

      // Drag and drop support for reordering jobs within a category
      div.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', job.id);
      });

      div.addEventListener('dragover', e => e.preventDefault());

      div.addEventListener('drop', e => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        reorderJob(draggedId, job.id, cat);
      });

      list.appendChild(div);
    });

    section.appendChild(header);
    section.appendChild(list);
    jobsListEl.appendChild(section);
  });
}

// Reorder jobs within the same category
function reorderJob(dragId, targetId, category) {
  const jobsInCategory = data.jobs.filter(j => j.category === category);
  const dragIndex = jobsInCategory.findIndex(j => j.id === dragId);
  const targetIndex = jobsInCategory.findIndex(j => j.id === targetId);
  if (dragIndex === -1 || targetIndex === -1) return;

  const [moved] = jobsInCategory.splice(dragIndex, 1);
  jobsInCategory.splice(targetIndex, 0, moved);

  const others = data.jobs.filter(j => j.category !== category);
  data.jobs = [...others, ...jobsInCategory];

  renderJobs();
}

// ---------- Employees rendering ----------

function renderEmployees() {
  employeesListEl.innerHTML = '';

  const weekKey = getCurrentWeekKey();
  const districts = ['Electrical', 'Instrumentation', 'Flex'];

  // We group employees by district to make it easier to see teams
  districts.forEach(district => {
    const employeesInDistrict = data.employees.filter(e => e.district === district);
    if (employeesInDistrict.length === 0) return;

    const header = document.createElement('div');
    header.className = 'district-header';
    header.textContent = district;
    employeesListEl.appendChild(header);

    employeesInDistrict.forEach(emp => {
      const card = document.createElement('div');
      card.className = 'employee-card';
      if (emp.collapsed) card.classList.add('collapsed');

      const headerRow = document.createElement('div');
      headerRow.className = 'employee-header';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'employee-name';
      nameSpan.textContent = emp.name;

      // District dropdown so we can change an employee's group
      const districtSpan = document.createElement('span');
      districtSpan.className = 'employee-district';

      const districtSelect = document.createElement('select');
      ['Electrical', 'Instrumentation', 'Flex'].forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        if (emp.district === d) opt.selected = true;
        districtSelect.appendChild(opt);
      });
      districtSelect.onchange = () => {
        emp.district = districtSelect.value;
        renderEmployees();
      };
      districtSpan.appendChild(districtSelect);

      const total = totalHoursForEmployeeWeek(weekKey, emp.id);
      const budgetSpan = document.createElement('span');
      budgetSpan.className = 'employee-budget';
      budgetSpan.textContent = `Allocated: ${total}/${emp.weeklyBudget} hrs`;

      const toggleBtn = document.createElement('button');
      toggleBtn.textContent = 'Toggle';
      toggleBtn.onclick = () => {
        emp.collapsed = !emp.collapsed;
        card.classList.toggle('collapsed');
      };

      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      removeBtn.onclick = () => removeEmployee(emp.id);

      headerRow.appendChild(nameSpan);
      headerRow.appendChild(districtSpan);
      headerRow.appendChild(budgetSpan);
      headerRow.appendChild(toggleBtn);
      headerRow.appendChild(removeBtn);

      // Gauge label shows usage percentage
      const gaugeLabel = document.createElement('div');
      gaugeLabel.className = 'gauge-label';
      const pct = emp.weeklyBudget > 0 ? Math.round((total / emp.weeklyBudget) * 100) : 0;
      gaugeLabel.textContent = `Usage: ${pct}%`;

      // Gauge bar shows how the employee's time is split
      const gauge = document.createElement('div');
      gauge.className = 'gauge';
      if (pct > 100) gauge.classList.add('over-budget');

      const empAssignments = getEmployeeAssignmentsForWeek(weekKey, emp.id);

      // We base the gauge on total hours (even if over budget)
      const totalHours = total || 1;
      let offset = 0;

      // For each job assigned to this employee, we draw segments
      Object.entries(empAssignments).forEach(([jobId, a]) => {
        const parentHours = a.hours || 0;
        if (parentHours <= 0) return;

        const job = data.jobs.find(j => j.id === jobId);
        const baseColor = job && job.color ? job.color : DEFAULT_COLOR;

        const parentPctOfTotal = (parentHours / totalHours) * 100;

        const subtasks = a.subtasks || [];
        const totalSubHours = subtasks.reduce((s, sub) => s + (sub.hours || 0), 0);

        // If there are no subtasks, just draw a solid block
        if (subtasks.length === 0 || totalSubHours <= 0) {
          const fill = document.createElement('div');
          fill.className = 'gauge-fill';
          fill.style.left = offset + '%';
          fill.style.width = parentPctOfTotal + '%';
          fill.style.background = baseColor;
          gauge.appendChild(fill);
          offset += parentPctOfTotal;
          return;
        }

        // If subtasks exceed parent hours, we scale them down
        const scale = totalSubHours > parentHours ? (parentHours / totalSubHours) : 1;
        let usedParentHours = 0;

        // Draw each subtask as a colored slice of the parent job
        subtasks.forEach(sub => {
          const rawSubHours = sub.hours || 0;
          if (rawSubHours <= 0) return;

          const effectiveSubHours = rawSubHours * scale;
          usedParentHours += effectiveSubHours;

          const subPctOfTotal = (effectiveSubHours / totalHours) * 100;

          const fill = document.createElement('div');
          fill.className = 'gauge-fill';
          fill.style.left = offset + '%';
          fill.style.width = subPctOfTotal + '%';
          fill.style.background = sub.color || baseColor;
          gauge.appendChild(fill);

          offset += subPctOfTotal;
        });

        // Any remaining parent hours are shown in the base job color
        const remainingParentHours = Math.max(0, parentHours - usedParentHours);
        if (remainingParentHours > 0) {
          const remainingPctOfTotal = (remainingParentHours / totalHours) * 100;
          const fill = document.createElement('div');
          fill.className = 'gauge-fill';
          fill.style.left = offset + '%';
          fill.style.width = remainingPctOfTotal + '%';
          fill.style.background = baseColor;
          gauge.appendChild(fill);
          offset += remainingPctOfTotal;
        }
      });

      // Dropzone where jobs can be dragged onto this employee
      const dropzone = document.createElement('div');
      dropzone.className = 'employee-dropzone';
      dropzone.dataset.employeeId = emp.id;

      dropzone.addEventListener('dragover', e => {
        e.preventDefault();
        dropzone.classList.add('over');
      });

      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));

      dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('over');
        const jobId = e.dataTransfer.getData('text/plain');
        if (jobId) addAssignment(weekKey, emp.id, jobId);
      });

      // Render each job assignment inside the employee card
      Object.keys(empAssignments).forEach(jobId => {
        const job = data.jobs.find(j => j.id === jobId);
        if (!job) return;

        const assignment = empAssignments[jobId];

        const row = document.createElement('div');
        row.className = 'assignment';

        const top = document.createElement('div');
        top.className = 'assignment-top';

        const label = document.createElement('span');
        label.textContent = job.name;

        const hoursInput = document.createElement('input');
        hoursInput.type = 'number';
        hoursInput.min = '0';
        hoursInput.step = '0.25';
        hoursInput.value = assignment.hours || 0;
        hoursInput.onchange = () => {
          updateAssignmentHours(
            weekKey,
            emp.id,
            jobId,
            parseFloat(hoursInput.value) || 0
          );
        };

        const removeAssignBtn = document.createElement('button');
        removeAssignBtn.textContent = 'X';
        removeAssignBtn.onclick = () => removeAssignment(weekKey, emp.id, jobId);

        top.appendChild(label);
        top.appendChild(hoursInput);
        top.appendChild(removeAssignBtn);

        // Subtask list for this assignment
        const subList = document.createElement('div');
        subList.className = 'subtask-list';

        assignment.subtasks = assignment.subtasks || [];
        assignment.subtasks.forEach((sub, index) => {
          const subRow = document.createElement('div');
          subRow.className = 'subtask-row';

          // Dot to visually separate subtasks
          const dot = document.createElement('span');
          dot.textContent = '•';
          dot.style.width = '10px';

          const subName = document.createElement('span');
          subName.textContent = sub.name;

          const subHours = document.createElement('input');
          subHours.type = 'number';
          subHours.min = '0';
          subHours.step = '0.25';
          subHours.value = sub.hours || 0;
          subHours.onchange = () => {
            sub.hours = parseFloat(subHours.value) || 0;
            renderEmployees();
          };

          const colorInput = document.createElement('input');
          colorInput.type = 'color';
          colorInput.value = sub.color || (job.color || DEFAULT_COLOR);
          colorInput.onchange = () => {
            sub.color = colorInput.value;
            renderEmployees();
          };

          const del = document.createElement('button');
          del.textContent = 'X';
          del.onclick = () => {
            assignment.subtasks.splice(index, 1);
            renderEmployees();
          };

          subRow.appendChild(dot);
          subRow.appendChild(subName);
          subRow.appendChild(subHours);
          subRow.appendChild(colorInput);
          subRow.appendChild(del);
          subList.appendChild(subRow);
        });

        // Subtask input row appears just under the header
        const subInputRow = document.createElement('div');
        subInputRow.style.display = 'flex';
        subInputRow.style.gap = '4px';
        subInputRow.style.alignItems = 'center';
        subInputRow.style.marginTop = '2px';

        const subInputLabel = document.createElement('span');
        subInputLabel.style.fontSize = '11px';
        subInputLabel.textContent = 'Subtask name:';

        const subInput = document.createElement('input');
        subInput.placeholder = 'Add subtask';
        subInput.style.flex = '1';
        subInput.onkeydown = e => {
          if (e.key === 'Enter' && subInput.value.trim()) {
            assignment.subtasks.push({
              name: subInput.value.trim(),
              hours: 0,
              color: job.color || DEFAULT_COLOR
            });
            subInput.value = '';
            renderEmployees();
          }
        };

        subInputRow.appendChild(subInputLabel);
        subInputRow.appendChild(subInput);

        row.appendChild(top);
        row.appendChild(subInputRow);
        row.appendChild(subList);

        dropzone.appendChild(row);
      });

      card.appendChild(headerRow);
      card.appendChild(gaugeLabel);
      card.appendChild(gauge);
      card.appendChild(dropzone);

      employeesListEl.appendChild(card);
    });
  });
}

// ---------- Project chart rendering ----------

// This chart shows total hours per project (plus unutilized time).
function renderProjectChart() {
  const weekKey = getCurrentWeekKey();
  const canvas = projectChartCanvas;
  const ctx = canvas.getContext('2d');

  // Match canvas size to its displayed size
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  const week = getAssignmentsForWeek(weekKey);
  const projectTotals = {};
  const projectEmployees = {};

  // Sum hours per project across all employees
  Object.entries(week).forEach(([empId, empAssignments]) => {
    Object.entries(empAssignments).forEach(([jobId, a]) => {
      const parentHours = a.hours || 0;
      if (parentHours <= 0) return;

      projectTotals[jobId] = (projectTotals[jobId] || 0) + parentHours;

      if (!projectEmployees[jobId]) projectEmployees[jobId] = new Set();
      projectEmployees[jobId].add(empId);
    });
  });

  // Utilization summary at the top
  const usedHours = totalHoursAllEmployees(weekKey);
  const capacity = totalEmployeeCapacity();
  const unutilizedHours = Math.max(0, capacity - usedHours);
  const utilizationPct = capacity > 0 ? Math.round((usedHours / capacity) * 100) : 0;

  chartHeaderLineEl.textContent =
    `Utilization: ${usedHours}/${capacity} - ${utilizationPct}%`;

  // Add an "Unutilized" bar if there is unused capacity
  if (unutilizedHours > 0) {
    projectTotals['__unutilized__'] = unutilizedHours;
  }

  // Build legend under the chart
  chartLegendEl.innerHTML = '';
  Object.entries(projectTotals).forEach(([jobId, hours]) => {
    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';

    const colorBox = document.createElement('div');
    colorBox.className = 'legend-color';

    let labelText = '';

    if (jobId === '__unutilized__') {
      colorBox.style.background = '#9ca3af';
      labelText = `Unutilized: ${hours} hrs`;
    } else {
      const job = data.jobs.find(j => j.id === jobId);
      if (!job) return;

      colorBox.style.background = job.color || DEFAULT_COLOR;
      const empCount = projectEmployees[jobId] ? projectEmployees[jobId].size : 0;
      labelText =
        `${job.name}: ${hours} hrs (${empCount} employee${empCount === 1 ? '' : 's'})`;
    }

    const label = document.createElement('span');
    label.textContent = labelText;

    legendItem.appendChild(colorBox);
    legendItem.appendChild(label);
    chartLegendEl.appendChild(legendItem);
  });

  // Draw the bars
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const jobIds = Object.keys(projectTotals);
  if (jobIds.length === 0) return;

  const width = canvas.width;
  const height = canvas.height;
  const max = Math.max(...Object.values(projectTotals), 1);

  const barWidth = Math.max(
    30,
    Math.min(60, (width - 80) / jobIds.length - 20)
  );
  const gap = 20;
  const bottomMargin = 30;
  const topMargin = 30;
  const chartHeight = height - bottomMargin - topMargin;

  ctx.font = '11px Arial';
  ctx.textBaseline = 'middle';

  jobIds.forEach((jobId, index) => {
    const hours = projectTotals[jobId];
    const x = 40 + index * (barWidth + gap);
    const barHeight = (hours / max) * chartHeight;
    const y = height - bottomMargin - barHeight;

    let color = DEFAULT_COLOR;
    let name = '';

    if (jobId === '__unutilized__') {
      color = '#9ca3af';
      name = 'Unutilized';
    } else {
      const job = data.jobs.find(j => j.id === jobId);
      if (!job) return;
      color = job.color || DEFAULT_COLOR;
      name = job.name;
    }

    ctx.fillStyle = color;
    ctx.fillRect(x, y, barWidth, barHeight);

    // Show hours and percentage of total capacity at the top of each bar
    const capacity = totalEmployeeCapacity();
    const percentOfWorkload =
      capacity > 0 ? Math.round((hours / capacity) * 100) : 0;

    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.fillText(`${hours}h (${percentOfWorkload}%)`, x + barWidth / 2, y - 10);

    // Draw the project name at the bottom, rotated slightly
    ctx.save();
    ctx.translate(x + barWidth / 2, height - bottomMargin + 12);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(name, 0, 0);
    ctx.restore();
  });
}

// ---------- Data helpers ----------

function removeJobFromAssignments(jobId) {
  Object.values(data.assignments).forEach(week => {
    Object.values(week).forEach(empAssignments => {
      if (empAssignments[jobId]) {
        delete empAssignments[jobId];
      }
    });
  });
}

function removeEmployeeFromAssignments(empId) {
  Object.values(data.assignments).forEach(week => {
    if (week[empId]) {
      delete week[empId];
    }
  });
}

function ensureAssignment(weekKey, empId, jobId) {
  const empAssignments = getEmployeeAssignmentsForWeek(weekKey, empId);
  if (!empAssignments[jobId]) {
    const job = data.jobs.find(j => j.id === jobId);
    const emp = data.employees.find(e => e.id === empId);
    const district = emp?.district || DEFAULT_DISTRICT;
    empAssignments[jobId] = {
      hours: 0,
      subtasks: job ? deepCopySubtasksTemplate(job, district) : []
    };
  }
  return empAssignments[jobId];
}

function clearInputs(...ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

// ---------- Data operations for jobs and employees ----------

// Add a new job to the list
function addJob(name, category, color) {
  if (!name.trim()) return;

  data.jobs.push({
    id: uuid(),
    name: name.trim(),
    category: category,
    color: color || DEFAULT_COLOR,
    subtasks: [],
    collapsed: false
  });

  renderJobs();
}

// Remove a job and any assignments that reference it
function removeJob(jobId) {
  data.jobs = data.jobs.filter(j => j.id !== jobId);
  removeJobFromAssignments(jobId);
  renderAll();
}

// Add a new employee
function addEmployee(name, weeklyBudget, district) {
  if (!name.trim()) return;

  const budget = parseFloat(weeklyBudget);
  if (isNaN(budget) || budget <= 0) return;

  data.employees.push({
    id: uuid(),
    name: name.trim(),
    weeklyBudget: budget,
    district: district || DEFAULT_DISTRICT,
    collapsed: false
  });

  renderEmployees();
}

// Remove an employee and their assignments
function removeEmployee(empId) {
  data.employees = data.employees.filter(e => e.id !== empId);
  removeEmployeeFromAssignments(empId);
  renderEmployees();
}

// Copy subtasks from a job template, filtered by employee district
function deepCopySubtasksTemplate(job, district) {
  const subtasks = job.subtasks || [];
  return subtasks
    .filter(st => {
      if (district === 'Flex') return true;
      return st.category === district;
    })
    .map(st => ({
      name: st.name,
      hours: 0,
      color: st.color || job.color || DEFAULT_COLOR,
      category: st.category || 'Other'
    }));
}

// Add an assignment when a job is dropped onto an employee
function addAssignment(weekKey, empId, jobId) {
  ensureAssignment(weekKey, empId, jobId);
  renderEmployees();
}

// Update the hours for a specific job assignment
function updateAssignmentHours(weekKey, empId, jobId, hours) {
  const assignment = ensureAssignment(weekKey, empId, jobId);
  assignment.hours = hours;
  renderEmployees();
}

// Remove a job assignment from an employee
function removeAssignment(weekKey, empId, jobId) {
  const empAssignments = getEmployeeAssignmentsForWeek(weekKey, empId);
  if (empAssignments[jobId]) delete empAssignments[jobId];
  renderEmployees();
}

// ---------- Week navigation buttons ----------

document.getElementById('prevWeekBtn').addEventListener('click', () => {
  data.currentWeekStart.setDate(data.currentWeekStart.getDate() - 7);
  renderAll();
});

document.getElementById('nextWeekBtn').addEventListener('click', () => {
  data.currentWeekStart.setDate(data.currentWeekStart.getDate() + 7);
  renderAll();
});

// Jump back to the current week
document.getElementById('jumpToPresentBtn').addEventListener('click', () => {
  data.currentWeekStart = startOfWeek(new Date());
  renderAll();
});

// ---------- Add job / employee events ----------

document.getElementById('addJobBtn').addEventListener('click', () => {
  const nameInput = document.getElementById('jobNameInput');
  const categoryInput = document.getElementById('jobCategoryInput');
  const colorInput = document.getElementById('jobColorInput');

  addJob(nameInput.value, categoryInput.value, colorInput.value);
  clearInputs('jobNameInput');
});

document.getElementById('jobNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const nameInput = document.getElementById('jobNameInput');
    const categoryInput = document.getElementById('jobCategoryInput');
    const colorInput = document.getElementById('jobColorInput');

    addJob(nameInput.value, categoryInput.value, colorInput.value);
    clearInputs('jobNameInput');
  }
});

document.getElementById('addEmployeeBtn').addEventListener('click', () => {
  const nameInput = document.getElementById('employeeNameInput');
  const budgetInput = document.getElementById('employeeBudgetInput');
  const districtInput = document.getElementById('employeeDistrictInput');

  addEmployee(nameInput.value, budgetInput.value, districtInput.value);
  clearInputs('employeeNameInput', 'employeeBudgetInput');
});

document.getElementById('employeeNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const nameInput = document.getElementById('employeeNameInput');
    const budgetInput = document.getElementById('employeeBudgetInput');
    const districtInput = document.getElementById('employeeDistrictInput');

    addEmployee(nameInput.value, budgetInput.value, districtInput.value);
    clearInputs('employeeNameInput', 'employeeBudgetInput');
  }
});

// ---------- Export CSV ----------

document.getElementById('exportCsvBtn').addEventListener('click', () => {
  const weekKey = getCurrentWeekKey();
  const weekAssignments = getAssignmentsForWeek(weekKey);

  const rows = [];
  rows.push([
    'Week',
    'Employee',
    'District',
    'Job',
    'Hours',
    'EmployeeBudget',
    'TotalAllocatedForEmployee'
  ]);

  data.employees.forEach(emp => {
    const empAssignments = weekAssignments[emp.id] || {};
    const total = totalHoursForEmployeeWeek(weekKey, emp.id);
    const jobIds = Object.keys(empAssignments);

    if (jobIds.length === 0) {
      rows.push([
        weekKey,
        emp.name,
        emp.district || '',
        '',
        '',
        emp.weeklyBudget,
        total
      ]);
    } else {
      jobIds.forEach(jobId => {
        const job = data.jobs.find(j => j.id === jobId);
        const jobName = job ? job.name : '(deleted job)';
        const hours = empAssignments[jobId].hours || 0;
        rows.push([
          weekKey,
          emp.name,
          emp.district || '',
          jobName,
          hours,
          emp.weeklyBudget,
          total
        ]);
      });
    }
  });

  const csvContent = rows
    .map(r =>
      r
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `week_${weekKey}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ---------- Export / Import JSON ----------

document.getElementById('exportJsonBtn').addEventListener('click', () => {
  const exportData = {
    employees: typeof structuredClone === 'function'
      ? structuredClone(data.employees)
      : JSON.parse(JSON.stringify(data.employees)),
    jobs: typeof structuredClone === 'function'
      ? structuredClone(data.jobs)
      : JSON.parse(JSON.stringify(data.jobs)),
    assignments: typeof structuredClone === 'function'
      ? structuredClone(data.assignments)
      : JSON.parse(JSON.stringify(data.assignments)),
    currentWeekStart: data.currentWeekStart.toISOString()
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'planner_data.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById('importJsonInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const imported = JSON.parse(evt.target.result);

      if (!Array.isArray(imported.employees)) {
        alert('Invalid JSON format: employees must be an array.');
        return;
      }
      if (!Array.isArray(imported.jobs)) {
        alert('Invalid JSON format: jobs must be an array.');
        return;
      }
      if (typeof imported.assignments !== 'object' || imported.assignments === null) {
        alert('Invalid JSON format: assignments must be an object.');
        return;
      }

      data.employees = imported.employees;
      data.jobs = imported.jobs;
      data.assignments = imported.assignments;
      data.currentWeekStart = imported.currentWeekStart
        ? new Date(imported.currentWeekStart)
        : startOfWeek(new Date());

      renderAll();
    } catch (err) {
      console.error(err);
      alert('Failed to parse JSON.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ---------- Resizable columns ----------

// These functions let the user drag the vertical dividers
// to resize the chart, jobs, and employees columns.
function makeResizable(divider, leftCol, rightCol) {
  let dragging = false;

  divider.addEventListener('mousedown', () => (dragging = true));
  window.addEventListener('mouseup', () => (dragging = false));

  window.addEventListener('mousemove', e => {
    if (!dragging) return;

    const containerRect = document.querySelector('.container').getBoundingClientRect();
    const totalWidth = containerRect.width;
    const x = e.clientX - containerRect.left;

    if (divider.id === 'divider1') {
      // Divider between chart and jobs
      const min = 150;
      const max = totalWidth - 300;
      const leftWidth = Math.max(min, Math.min(x, max));

      const employeesWidth = document.querySelector('.employees-column').offsetWidth;
      const divider2Width = document.getElementById('divider2').offsetWidth;
      const rightWidth =
        totalWidth - leftWidth - divider.offsetWidth - employeesWidth - divider2Width;

      if (rightWidth < 150) return;

      leftCol.style.width = leftWidth + 'px';
      rightCol.style.width = rightWidth + 'px';
    } else if (divider.id === 'divider2') {
      // Divider between jobs and employees
      const chartWidth = document.querySelector('.chart-column').offsetWidth;
      const divider1Width = document.getElementById('divider1').offsetWidth;
      const min = 150;
      const max = totalWidth - chartWidth - 300;
      const leftWidth = Math.max(
        min,
        Math.min(x - chartWidth - divider1Width, max)
      );
      const rightWidth =
        totalWidth - chartWidth - divider1Width - divider.offsetWidth - leftWidth;

      if (rightWidth < 150) return;

      leftCol.style.width = leftWidth + 'px';
      rightCol.style.width = rightWidth + 'px';
    }

    forceChartUpdate();
  });
}

// Hook up the two dividers
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

// ---------- Render everything once at startup ----------

function renderAll() {
  renderWeekLabel();
  renderJobs();
  renderEmployees();
  forceChartUpdate();
}

renderAll();
