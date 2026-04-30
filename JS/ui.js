// ui.js
import {
  data,
  DEFAULT_COLOR,
  DEFAULT_DISTRICT,
  uuid,
  pickUnusedColor,
  getCurrentWeekKey,
  getAssignmentsForWeek,
  getEmployeeAssignmentsForWeek,
  ensureAssignment,
  removeJobFromAssignments,
  removeEmployeeFromAssignments
} from './data.js';
import { forceChartUpdate } from './charts.js';

export function renderJobs() {}
export function renderEmployees() {}

export function addJob(...) { ... }
export function removeJob(...) { ... }
export function addEmployee(...) { ... }
export function removeEmployee(...) { ... }

export function showToast(msg, duration = 2500) { ... }
export function makeResizable(...) { ... }
