const path = require('path');
const express = require('express');
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const { google } = require('googleapis');
require('dotenv').config();

dayjs.extend(customParseFormat);

const app = express();
const port = Number(process.env.PORT || 3000);

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1HdskGnqxseXqtOx_b4T7rRdDDapHexVQBy0Es4k2c0w';
const PLANNING_RANGE = process.env.PLANNING_RANGE || 'Planning!A1:P';
const DATA_RANGE = process.env.DATA_RANGE || 'Data!A1:Z';
const PARAM_RANGE = process.env.PARAM_RANGE || 'Param!A1:Z';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

function jsonFromEnv() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return null;
  try {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
  }
}

function privateKeyFromEnv() {
  return process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : null;
}

function getGoogleAuth() {
  const accountJson = jsonFromEnv();
  if (accountJson) {
    return new google.auth.GoogleAuth({ credentials: accountJson, scopes: SCOPES });
  }
  if (process.env.GOOGLE_CLIENT_EMAIL && privateKeyFromEnv()) {
    return new google.auth.GoogleAuth({
      credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: privateKeyFromEnv() },
      scopes: SCOPES
    });
  }
  throw new Error('Missing Google credentials. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY.');
}

async function fetchRange(range) {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range });
  return response.data.values || [];
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const [headers, ...dataRows] = rows;
  return dataRows.filter((row) => row.some(Boolean)).map((row) => headers.reduce((acc, key, index) => {
    acc[key] = row[index] || '';
    return acc;
  }, {}));
}

function parseDate(value) {
  const knownFormats = ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'];
  for (const format of knownFormats) {
    const candidate = dayjs(value, format, true);
    if (candidate.isValid()) return candidate;
  }
  const fallback = dayjs(value);
  return fallback.isValid() ? fallback : null;
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  const sanitized = String(value).replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

function summarizePlanning(planningRows) {
  const now = dayjs().startOf('day');
  const sessions = planningRows.map((row) => {
    const dateObj = parseDate(row['Date']);
    return {
      date: dateObj ? dateObj.format('YYYY-MM-DD') : row['Date'],
      week: row['Week'] || '-',
      phase: row['Phase'] || '-',
      sessionName: row['Session name'] || '-',
      type: row['Type'] || '-',
      objective: row['Objective'] || '-',
      plannedDistanceKm: toNumber(row['Planned distance (km)']),
      plannedPace: row['Planned pace'] || '-',
      plannedBpm: row['Planned BPM'] || '-',
      plannedDuration: row['Planned duration'] || '-',
      completed: row['Completed'] || '',
      actualDistance: row['Actual distance'] || '',
      actualPace: row['Actual pace'] || '',
      actualBpm: row['Actual BPM'] || '',
      effort: row['Effort'] || '',
      coachFeedback: row['Coach feedback'] || '',
      _dateObj: dateObj
    };
  }).sort((a, b) => (a._dateObj && b._dateObj ? a._dateObj.valueOf() - b._dateObj.valueOf() : 0));

  const upcoming = sessions.filter((s) => !s._dateObj || !s._dateObj.isBefore(now));
  const weekDistance = upcoming.filter((s) => s._dateObj && s._dateObj.isSame(now, 'week')).reduce((sum, s) => sum + (s.plannedDistanceKm || 0), 0);

  return {
    nextSession: upcoming[0] || null,
    upcoming,
    totalPlannedDistanceKm: sessions.reduce((sum, s) => sum + (s.plannedDistanceKm || 0), 0),
    plannedDistanceThisWeekKm: Number(weekDistance.toFixed(1))
  };
}

function summarizeData(dataRows) {
  const sorted = dataRows.map((row) => {
    const dateObj = parseDate(row['date'] || row['Date']);
    return {
      date: dateObj ? dateObj.format('YYYY-MM-DD') : row['date'] || row['Date'] || '-',
      name: row['Name'] || '-',
      distanceKm: toNumber(row['Distance (km)']),
      paceAvg: row['Pace (avg)'] || '-',
      bpmAvg: toNumber(row['BPM (avg)']),
      effort: row['Effort'] || '-',
      time: row['Time (h:m:s)'] || row['Time (sec)'] || '-',
      _dateObj: dateObj
    };
  }).filter((item) => item._dateObj).sort((a, b) => b._dateObj.valueOf() - a._dateObj.valueOf());

  return { latest: sorted[0] || null, recent: sorted.slice(0, 8), totalActivities: sorted.length };
}

function summarizeParam(paramRows) {
  const values = {};
  paramRows.forEach((row) => {
    if (row[0]) values[row[0]] = row[1] || '';
  });
  return {
    runnerName: values['Runner name'] || values['Nom'] || 'Runner',
    age: values.Age || '-',
    mainObjective: values['Main objective'] || values['Objectif principal'] || '-',
    targetTime: values.Target || values['Objectif chrono'] || '-',
    fcmax: values.FCmax || values.HRmax || '-'
  };
}

app.get('/api/dashboard', async (_req, res) => {
  try {
    const [planningRaw, dataRaw, paramRaw] = await Promise.all([
      fetchRange(PLANNING_RANGE),
      fetchRange(DATA_RANGE),
      fetchRange(PARAM_RANGE)
    ]);

    res.json({
      meta: { spreadsheetId: SHEET_ID, generatedAt: new Date().toISOString() },
      profile: summarizeParam(paramRaw.slice(1)),
      planning: summarizePlanning(rowsToObjects(planningRaw)),
      activity: summarizeData(rowsToObjects(dataRaw))
    });
  } catch (error) {
    res.status(500).json({ error: 'Unable to load Google Sheets data.', details: error.message });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.listen(port, () => console.log(`Remirun dashboard running at http://localhost:${port}`));
