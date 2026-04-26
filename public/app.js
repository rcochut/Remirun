function card(label, value, sub = '') {
  return `<article class="card"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></article>`;
}

function renderList(root, items, mapper) {
  root.innerHTML = items.map(mapper).join('');
}

async function load() {
  const title = document.getElementById('title');
  const stamp = document.getElementById('stamp');
  const overview = document.getElementById('overview');
  const planningList = document.getElementById('planning-list');
  const historyList = document.getElementById('history-list');

  try {
    const response = await fetch('/api/dashboard');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.details || 'Failed to load dashboard.');
    }

    const { profile, planning, activity, meta } = data;
    title.textContent = `${profile.runnerName} · ${profile.mainObjective}`;
    stamp.textContent = `Last sync: ${new Date(meta.generatedAt).toLocaleString()}`;

    overview.innerHTML = [
      card('Target', profile.targetTime || '-', `FCmax ${profile.fcmax}`),
      card('Planned (total)', `${planning.totalPlannedDistanceKm || 0} km`, 'From Planning sheet'),
      card('This week', `${planning.plannedDistanceThisWeekKm || 0} km`, 'Upcoming only'),
      card('Total activities', `${activity.totalActivities || 0}`, 'From Data sheet')
    ].join('');

    renderList(planningList, planning.upcoming.slice(0, 6), (session) => `
      <article class="item">
        <div>
          <strong>${session.sessionName}</strong>
          <span class="muted">${session.date} · ${session.type}</span>
        </div>
        <div>
          <span class="tag">${session.plannedDistanceKm || '-'} km</span>
          <div class="muted">${session.plannedPace}</div>
        </div>
      </article>
    `);

    renderList(historyList, activity.recent, (run) => `
      <article class="item">
        <div>
          <strong>${run.name}</strong>
          <span class="muted">${run.date} · ${run.time}</span>
        </div>
        <div>
          <span class="tag">${run.distanceKm || '-'} km</span>
          <div class="muted">BPM ${run.bpmAvg || '-'}</div>
        </div>
      </article>
    `);
  } catch (error) {
    title.textContent = 'Dashboard unavailable';
    stamp.textContent = error.message;
    overview.innerHTML = card('Error', '!', 'Check credentials and sheet access');
  }
}

load();
