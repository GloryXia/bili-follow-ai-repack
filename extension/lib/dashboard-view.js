export function createDashboardController({ root = document, requestData }) {
  const loading = query('#loading');
  const grid = query('#dashGrid');
  const errorBox = query('#errorBox');
  const errorText = query('#errorMsg');
  const templates = {
    followBody: query('#followBody')?.innerHTML || '',
    favBody: query('#favBody')?.innerHTML || '',
    wlBody: query('#wlCard .card-body')?.innerHTML || '',
    histBody: query('#histCard .card-body')?.innerHTML || '',
  };

  async function loadData() {
    restoreBodies();
    loading.style.display = 'flex';
    grid.style.display = 'none';
    errorBox.style.display = 'none';

    try {
      const response = await requestData();
      const data = response?.data ?? response;

      loading.style.display = 'none';
      grid.style.display = 'grid';

      renderOverview(data);
      renderFollow(data.follow);
      renderFavorites(data.favorites);
      renderWatchLater(data.watchlater);
      renderHistory(data.history);
    } catch (error) {
      loading.style.display = 'none';
      errorBox.style.display = 'block';
      errorText.textContent = error.message || '加载失败';
    }
  }

  function renderOverview(data) {
    const row = query('#overviewRow');
    const items = [
      { icon: '👥', number: data.follow?.totalFollows ?? '--', label: '关注总数' },
      { icon: '⭐', number: data.favorites?.totalItems ?? '--', label: '收藏总数' },
      { icon: '⏰', number: data.watchlater?.total ?? '--', label: '稍后再看' },
      { icon: '🤖', number: data.stats?.classifiedCount ?? 0, label: '已分类' },
    ];

    row.innerHTML = items.map(item => `
      <div class="overview-card">
        <div class="overview-icon">${item.icon}</div>
        <div class="overview-number">${formatNum(item.number)}</div>
        <div class="overview-label">${item.label}</div>
      </div>
    `).join('');
  }

  function renderFollow(follow) {
    if (!follow || follow.error) {
      query('#followBody').innerHTML = renderError(follow?.error);
      return;
    }

    query('#followBadge').textContent = `${follow.totalTags} 个分组`;

    const tags = follow.tags.sort((a, b) => b.count - a.count);
    const maxCount = Math.max(...tags.map(tag => tag.count), 1);

    query('#followChart').innerHTML = tags.map(tag => `
      <div class="bar-row">
        <span class="bar-label" title="${tag.name}">${tag.name}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${(tag.count / maxCount * 100).toFixed(1)}%"></div>
        </div>
        <span class="bar-value">${tag.count}</span>
      </div>
    `).join('');
  }

  function renderFavorites(favorites) {
    if (!favorites || favorites.error) {
      query('#favBody').innerHTML = renderError(favorites?.error);
      return;
    }

    query('#favBadge').textContent = `${favorites.totalItems} 个收藏`;

    const folders = favorites.folders.sort((a, b) => b.count - a.count);
    const maxCount = Math.max(...folders.map(folder => folder.count), 1);

    query('#favChart').innerHTML = folders.map(folder => `
      <div class="bar-row">
        <span class="bar-label" title="${folder.title}">${folder.title}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${(folder.count / maxCount * 100).toFixed(1)}%"></div>
        </div>
        <span class="bar-value">${folder.count}</span>
      </div>
    `).join('');
  }

  function renderWatchLater(watchlater) {
    if (!watchlater || watchlater.error) {
      query('#wlCard .card-body').innerHTML = renderError(watchlater?.error);
      return;
    }

    query('#wlBadge').textContent = `${watchlater.total} 个`;

    const total = watchlater.total || 1;
    const unwatchedPct = (watchlater.unwatched / total * 100).toFixed(1);
    const watchedPct = (watchlater.watched / total * 100).toFixed(1);
    const invalidPct = (watchlater.invalid / total * 100).toFixed(1);
    const firstBreak = parseFloat(unwatchedPct);
    const secondBreak = firstBreak + parseFloat(watchedPct);

    query('#wlDonut').innerHTML = `
      <div class="donut" style="background: conic-gradient(
        #f472b6 0% ${firstBreak}%,
        #a78bfa ${firstBreak}% ${secondBreak}%,
        #334155 ${secondBreak}% 100%
      );">
        <div class="donut-center">${watchlater.total}</div>
      </div>
      <div class="donut-legend">
        <div class="legend-item"><span class="legend-dot" style="background:#f472b6"></span>未看 ${watchlater.unwatched}</div>
        <div class="legend-item"><span class="legend-dot" style="background:#a78bfa"></span>已看 ${watchlater.watched}</div>
        <div class="legend-item"><span class="legend-dot" style="background:#334155"></span>失效 ${watchlater.invalid}</div>
      </div>
    `;

    const items = watchlater.items || [];
    query('#wlList').innerHTML = items.length === 0
      ? '<div class="list-empty">列表为空</div>'
      : items.map(item => `
        <div class="wl-item">
          <span class="wl-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
          <span class="wl-owner">${escapeHtml(item.owner)}</span>
        </div>
      `).join('');
  }

  function renderHistory(history) {
    if (!history || history.error) {
      query('#histCard .card-body').innerHTML = renderError(history?.error);
      return;
    }

    query('#histBadge').textContent = `最近 ${history.recentCount} 条`;

    const items = history.items || [];
    query('#histList').innerHTML = items.length === 0
      ? '<div class="list-empty history-empty">暂无历史</div>'
      : items.map(item => {
        const time = item.viewAt
          ? new Date(item.viewAt * 1000).toLocaleString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '';

        return `<div class="hist-item">
          <div class="hist-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="hist-meta">${escapeHtml(item.author)}${time ? ' · ' + time : ''}${item.tag ? ' · ' + item.tag : ''}</div>
        </div>`;
      }).join('');
  }

  function query(selector) {
    return root.querySelector(selector);
  }

  function restoreBodies() {
    query('#followBody').innerHTML = templates.followBody;
    query('#favBody').innerHTML = templates.favBody;
    query('#wlCard .card-body').innerHTML = templates.wlBody;
    query('#histCard .card-body').innerHTML = templates.histBody;
  }

  return { loadData };
}

function formatNum(value) {
  if (typeof value !== 'number') return value;
  if (value >= 10000) return (value / 10000).toFixed(1) + '万';
  return value.toLocaleString();
}

function escapeHtml(value) {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderError(message) {
  return `<div class="inline-error">⚠️ ${message || '加载失败'}</div>`;
}
