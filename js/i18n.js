/**
 * Claude Context Window Visualizer — Internationalization (i18n)
 * Supports: English (en), Chinese Simplified (zh-CN), Japanese (ja)
 * Stores language preference in localStorage. Auto-detects browser language on first visit.
 */

const I18n = (function () {
  'use strict';

  const STORAGE_KEY = 'claude-ctx-viz-lang';

  const translations = {
    en: {
      // Header
      headerTitle: 'Context Window Visualizer',
      headerSubtitle: 'Claude Token Usage Monitor',

      // Header controls
      compare: 'Compare',

      // Category names
      systemPrompt: 'System Prompt',
      userMessages: 'User Messages',
      assistantOutput: 'Assistant Output',
      toolUse: 'Tool Use',

      // Slider section
      adjustTokenAllocation: 'Adjust Token Allocation',
      sliderSystem: 'System',
      sliderUser: 'User',
      sliderAssistant: 'Assistant',
      sliderTools: 'Tools',

      // Presets
      quickPresets: 'Quick Presets',
      presetLightChat: 'Light Chat',
      presetLightChatDesc: 'Simple conversation',
      presetLongConversation: 'Long Conversation',
      presetLongConversationDesc: 'Extended multi-turn dialogue',
      presetToolHeavy: 'Tool-Heavy Agent',
      presetToolHeavyDesc: 'Agent with many tool calls',
      presetNearLimit: 'Near Limit',
      presetNearLimitDesc: 'Context window almost full',

      // Stats
      totalUsed: 'Total Used',
      remaining: 'Remaining',
      contextWindow: 'Context Window',
      outputLimit: 'Output Limit',

      // Status
      statusNormal: 'Normal',
      statusWarning: 'Warning',
      statusCritical: 'Critical',

      // Gauge
      contextUsed: 'Context Used',

      // Timeline
      usageTimeline: 'Usage Timeline',
      snapshots: 'snapshots',
      adjustSlidersToRecord: 'Adjust sliders to record snapshots',
      oldest: 'Oldest',
      latest: 'Latest',
      used: 'used',

      // Footer
      footerBuiltWith: 'Built with \u2728 by',
      footerKeyboard: 'Keyboard:',
      footerReset: 'Reset',
      footerPresets: 'Presets',
      footerCompare: 'Compare',

      // Action bar
      exportPng: 'Export PNG',
      shareLink: 'Share Link',
      copyStats: 'Copy Stats',
      exportPngTitle: 'Export gauge as PNG image',
      shareLinkTitle: 'Copy shareable URL to clipboard',
      copyStatsTitle: 'Copy usage stats to clipboard',

      // Language selector
      language: 'Language',

      // v2.0 — New features
      dashboard: 'Dashboard',
      advancedCharts: 'Advanced Charts',
      chartPie: 'Pie',
      chartRadar: 'Radar',
      chartTrend: 'Trend',
      tokenFlowStream: 'Token Flow Stream',
      claudeCodeMemory: 'Claude Code Memory',
      sessionSimulator: 'Session Simulator',
      footerDashboard: 'Dashboard',

      // v2.1 — New features
      healthMonitor: 'Health Monitor',
      sankeyDiagram: 'Token Flow Diagram',
      cacheSavings: 'Prompt Cache Savings',
      costForecast: 'Cost Forecast & Budget',
      dailyRequests: 'Daily Requests',
      monthlyBudget: 'Monthly Budget',

      // v2.2 — Realtime Monitor, Alert Timeline, Token Waterfall
      realtimeMonitor: 'Realtime Context Monitor',
      realtimeMonitorDesc: 'Paste your Claude Code /context output or start a live simulation to monitor context window usage in real-time.',
      alertTimeline: 'Context Timeline & Alerts',
      alertTimelineDesc: 'Visualize context window usage over time with intelligent alerts when approaching capacity limits.',
      tokenWaterfall: 'Token Waterfall Analysis',
      tokenWaterfallDesc: 'Waterfall chart showing token distribution across conversation turns with cumulative growth overlay.',
      startSimulation: 'Start Simulation',
      stopSimulation: 'Stop Simulation',
      parseContext: 'Parse Context',
      tokensPerMin: 'Tokens/min',
      remainingCapacity: 'Remaining Capacity',
      estimatedMinutes: 'Est. Minutes Left',
      consumptionRate: 'Consumption Rate',
      totalTokens: 'Total Tokens',
      avgPerTurn: 'Avg per Turn',
      peakUsage: 'Peak Usage',
      estTurnsLeft: 'Est. Turns Left',
      importJson: 'Import JSON',
      exportJson: 'Export JSON',
      clearData: 'Clear Data',
      turnNumber: 'Turn',
      playReplay: 'Play',
      pauseReplay: 'Pause',
      resetReplay: 'Reset',
    },

    'zh-CN': {
      // Header
      headerTitle: '\u4E0A\u4E0B\u6587\u7A97\u53E3\u53EF\u89C6\u5316',
      headerSubtitle: 'Claude \u4EE4\u724C\u4F7F\u7528\u76D1\u63A7',

      // Header controls
      compare: '\u5BF9\u6BD4',

      // Category names
      systemPrompt: '\u7CFB\u7EDF\u63D0\u793A\u8BCD',
      userMessages: '\u7528\u6237\u6D88\u606F',
      assistantOutput: '\u52A9\u624B\u8F93\u51FA',
      toolUse: '\u5DE5\u5177\u4F7F\u7528',

      // Slider section
      adjustTokenAllocation: '\u8C03\u6574\u4EE4\u724C\u5206\u914D',
      sliderSystem: '\u7CFB\u7EDF',
      sliderUser: '\u7528\u6237',
      sliderAssistant: '\u52A9\u624B',
      sliderTools: '\u5DE5\u5177',

      // Presets
      quickPresets: '\u5FEB\u901F\u9884\u8BBE',
      presetLightChat: '\u8F7B\u91CF\u5BF9\u8BDD',
      presetLightChatDesc: '\u7B80\u5355\u5BF9\u8BDD',
      presetLongConversation: '\u957F\u5BF9\u8BDD',
      presetLongConversationDesc: '\u591A\u8F6E\u6269\u5C55\u5BF9\u8BDD',
      presetToolHeavy: '\u91CD\u5DE5\u5177\u4EE3\u7406',
      presetToolHeavyDesc: '\u5927\u91CF\u5DE5\u5177\u8C03\u7528\u7684\u4EE3\u7406',
      presetNearLimit: '\u63A5\u8FD1\u4E0A\u9650',
      presetNearLimitDesc: '\u4E0A\u4E0B\u6587\u7A97\u53E3\u51E0\u4E4E\u5DF2\u6EE1',

      // Stats
      totalUsed: '\u5DF2\u4F7F\u7528',
      remaining: '\u5269\u4F59',
      contextWindow: '\u4E0A\u4E0B\u6587\u7A97\u53E3',
      outputLimit: '\u8F93\u51FA\u9650\u5236',

      // Status
      statusNormal: '\u6B63\u5E38',
      statusWarning: '\u8B66\u544A',
      statusCritical: '\u5371\u6025',

      // Gauge
      contextUsed: '\u4E0A\u4E0B\u6587\u5DF2\u7528',

      // Timeline
      usageTimeline: '\u4F7F\u7528\u65F6\u95F4\u7EBF',
      snapshots: '\u5FEB\u7167',
      adjustSlidersToRecord: '\u8C03\u6574\u6ED1\u5757\u4EE5\u8BB0\u5F55\u5FEB\u7167',
      oldest: '\u6700\u65E7',
      latest: '\u6700\u65B0',
      used: '\u5DF2\u7528',

      // Footer
      footerBuiltWith: '\u7531\u2728\u6784\u5EFA',
      footerKeyboard: '\u952E\u76D8\uFF1A',
      footerReset: '\u91CD\u7F6E',
      footerPresets: '\u9884\u8BBE',
      footerCompare: '\u5BF9\u6BD4',

      // Action bar
      exportPng: '\u5BFC\u51FAPNG',
      shareLink: '\u5206\u4EAB\u94FE\u63A5',
      copyStats: '\u590D\u5236\u7EDF\u8BA1',
      exportPngTitle: '\u5C06\u4EEA\u8868\u5BFC\u51FA\u4E3APNG\u56FE\u7247',
      shareLinkTitle: '\u590D\u5236\u53EF\u5206\u4EAB\u7684URL\u5230\u526A\u8D34\u677F',
      copyStatsTitle: '\u590D\u5236\u4F7F\u7528\u7EDF\u8BA1\u5230\u526A\u8D34\u677F',

      // Language selector
      language: '\u8BED\u8A00',

      // v2.0 — New features
      dashboard: '\u4EEA\u8868\u76D8',
      advancedCharts: '\u9AD8\u7EA7\u56FE\u8868',
      chartPie: '\u997C\u56FE',
      chartRadar: '\u96F7\u8FBE\u56FE',
      chartTrend: '\u8D8B\u52BF',
      tokenFlowStream: '\u4EE4\u724C\u6D41',
      claudeCodeMemory: 'Claude Code \u5185\u5B58',
      sessionSimulator: '\u4F1A\u8BDD\u6A21\u62DF\u5668',
      footerDashboard: '\u4EEA\u8868\u76D8',

      // v2.1
      healthMonitor: '\u5065\u5EB7\u76D1\u63A7',
      sankeyDiagram: '\u4EE4\u724C\u6D41\u5411\u56FE',
      cacheSavings: '\u7F13\u5B58\u8282\u7701',
      costForecast: '\u6210\u672C\u9884\u6D4B\u4E0E\u9884\u7B97',
      dailyRequests: '\u6BCF\u65E5\u8BF7\u6C42\u6570',
      monthlyBudget: '\u6708\u5EA6\u9884\u7B97',

      // v2.2 — 实时监控、预警时间线、Token 瀑布流
      realtimeMonitor: '实时上下文监控',
      realtimeMonitorDesc: '粘贴 Claude Code 的 /context 输出或启动实时模拟，监控上下文窗口使用情况。',
      alertTimeline: '上下文时间线与预警',
      alertTimelineDesc: '随时间可视化上下文窗口使用情况，接近容量上限时智能预警。',
      tokenWaterfall: 'Token 瀑布流分析',
      tokenWaterfallDesc: '瀑布流图表展示每轮对话的 Token 分布，叠加累积增长曲线。',
      startSimulation: '开始模拟',
      stopSimulation: '停止模拟',
      parseContext: '解析上下文',
      tokensPerMin: 'Tokens/分钟',
      remainingCapacity: '剩余容量',
      estimatedMinutes: '预计剩余分钟',
      consumptionRate: '消耗速率',
      totalTokens: '总 Token 数',
      avgPerTurn: '平均每轮',
      peakUsage: '峰值使用率',
      estTurnsLeft: '预计剩余轮次',
      importJson: '导入 JSON',
      exportJson: '导出 JSON',
      clearData: '清除数据',
      turnNumber: '轮次',
      playReplay: '播放',
      pauseReplay: '暂停',
      resetReplay: '重置',
    },

    ja: {
      // Header
      headerTitle: '\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u30A6\u30A3\u30F3\u30C9\u30A6\u30D3\u30B8\u30E5\u30A2\u30E9\u30A4\u30B6\u30FC',
      headerSubtitle: 'Claude \u30C8\u30FC\u30AF\u30F3\u4F7F\u7528\u30E2\u30CB\u30BF\u30FC',

      // Header controls
      compare: '\u6BD4\u8F03',

      // Category names
      systemPrompt: '\u30B7\u30B9\u30C6\u30E0\u30D7\u30ED\u30F3\u30D7\u30C8',
      userMessages: '\u30E6\u30FC\u30B6\u30FC\u30E1\u30C3\u30BB\u30FC\u30B8',
      assistantOutput: '\u30A2\u30B7\u30B9\u30BF\u30F3\u30C8\u51FA\u529B',
      toolUse: '\u30C4\u30FC\u30EB\u4F7F\u7528',

      // Slider section
      adjustTokenAllocation: '\u30C8\u30FC\u30AF\u30F3\u5272\u308A\u5F53\u3066\u306E\u8ABF\u6574',
      sliderSystem: '\u30B7\u30B9\u30C6\u30E0',
      sliderUser: '\u30E6\u30FC\u30B6\u30FC',
      sliderAssistant: '\u30A2\u30B7\u30B9\u30BF\u30F3\u30C8',
      sliderTools: '\u30C4\u30FC\u30EB',

      // Presets
      quickPresets: '\u30AF\u30A4\u30C3\u30AF\u30D7\u30EA\u30BB\u30C3\u30C8',
      presetLightChat: '\u30E9\u30A4\u30C8\u30C1\u30E3\u30C3\u30C8',
      presetLightChatDesc: '\u30B7\u30F3\u30D7\u30EB\u306A\u4F1A\u8A71',
      presetLongConversation: '\u30ED\u30F3\u30B0\u30C1\u30E3\u30C3\u30C8',
      presetLongConversationDesc: '\u62E1\u5F35\u30DE\u30EB\u30C1\u30BF\u30FC\u30F3\u5BFE\u8A71',
      presetToolHeavy: '\u30C4\u30FC\u30EB\u591A\u7528\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8',
      presetToolHeavyDesc: '\u591A\u304F\u306E\u30C4\u30FC\u30EB\u547C\u3073\u51FA\u3057\u3092\u884C\u3046\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8',
      presetNearLimit: '\u4E0A\u9650\u4ED8\u8FD1',
      presetNearLimitDesc: '\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u30A6\u30A3\u30F3\u30C9\u30A6\u304C\u307B\u307C\u6E80\u676F',

      // Stats
      totalUsed: '\u5408\u8A08\u4F7F\u7528\u91CF',
      remaining: '\u6B8B\u308A',
      contextWindow: '\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u30A6\u30A3\u30F3\u30C9\u30A6',
      outputLimit: '\u51FA\u529B\u5236\u9650',

      // Status
      statusNormal: '\u6B63\u5E38',
      statusWarning: '\u8B66\u544A',
      statusCritical: '\u5371\u6A5F',

      // Gauge
      contextUsed: '\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u4F7F\u7528\u91CF',

      // Timeline
      usageTimeline: '\u4F7F\u7528\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3',
      snapshots: '\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8',
      adjustSlidersToRecord: '\u30B9\u30E9\u30A4\u30C0\u30FC\u3092\u8ABF\u6574\u3057\u3066\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u3092\u8A18\u9332',
      oldest: '\u6700\u53E4',
      latest: '\u6700\u65B0',
      used: '\u4F7F\u7528\u6E08\u307F',

      // Footer
      footerBuiltWith: '\u2728\u3067\u69CB\u7BC9',
      footerKeyboard: '\u30AD\u30FC\u30DC\u30FC\u30C9\uFF1A',
      footerReset: '\u30EA\u30BB\u30C3\u30C8',
      footerPresets: '\u30D7\u30EA\u30BB\u30C3\u30C8',
      footerCompare: '\u6BD4\u8F03',

      // Action bar
      exportPng: 'PNG\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8',
      shareLink: '\u30EA\u30F3\u30AF\u5171\u6709',
      copyStats: '\u7D71\u8A08\u30B3\u30D4\u30FC',
      exportPngTitle: '\u30B2\u30FC\u30B8\u3092PNG\u753B\u50CF\u3068\u3057\u3066\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8',
      shareLinkTitle: '\u5171\u6709\u53EF\u80FD\u306AURL\u3092\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC',
      copyStatsTitle: '\u4F7F\u7528\u7D71\u8A08\u3092\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC',

      // Language selector
      language: '\u8A00\u8A9E',

      // v2.0 — New features
      dashboard: '\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9',
      advancedCharts: '\u9AD8\u5EA6\u306A\u30C1\u30E3\u30FC\u30C8',
      chartPie: '\u5186\u30B0\u30E9\u30D5',
      chartRadar: '\u30EC\u30FC\u30C0\u30FC',
      chartTrend: '\u30C8\u30EC\u30F3\u30C9',
      tokenFlowStream: '\u30C8\u30FC\u30AF\u30F3\u30D5\u30ED\u30FC',
      claudeCodeMemory: 'Claude Code \u30E1\u30E2\u30EA',
      sessionSimulator: '\u30BB\u30C3\u30B7\u30E7\u30F3\u30B7\u30DF\u30E5\u30EC\u30FC\u30BF',
      footerDashboard: '\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9',

      // v2.1
      healthMonitor: '\u30D8\u30EB\u30B9\u30E2\u30CB\u30BF\u30FC',
      sankeyDiagram: '\u30C8\u30FC\u30AF\u30F3\u30D5\u30ED\u30FC\u56F3',
      cacheSavings: '\u30AD\u30E3\u30C3\u30B7\u30E5\u7BC0\u7D04',
      costForecast: '\u30B3\u30B9\u30C8\u4E88\u6E2C\u3068\u4E88\u7B97',
      dailyRequests: '\u65E5\u6B21\u30EA\u30AF\u30A8\u30B9\u30C8\u6570',
      monthlyBudget: '\u6708\u4E88\u7B97',

      // v2.2 — リアルタイムモニター、アラートタイムライン、トークンウォーターフォール
      realtimeMonitor: 'リアルタイムコンテキストモニター',
      realtimeMonitorDesc: 'Claude Codeの/context出力を貼り付けるか、ライブシミュレーションを開始して、コンテキストウィンドウの使用状況をリアルタイムで監視します。',
      alertTimeline: 'コンテキストタイムライン＆アラート',
      alertTimelineDesc: 'コンテキストウィンドウの使用状況を時系列で可視化し、容量制限に近づくとインテリジェントアラートを表示します。',
      tokenWaterfall: 'トークンウォーターフォール分析',
      tokenWaterfallDesc: '会話ターンごとのトークン分布をウォーターフォールチャートで表示し、累積成長オーバーレイを表示します。',
      startSimulation: 'シミュレーション開始',
      stopSimulation: 'シミュレーション停止',
      parseContext: 'コンテキスト解析',
      tokensPerMin: 'トークン/分',
      remainingCapacity: '残り容量',
      estimatedMinutes: '推定残り分数',
      consumptionRate: '消費レート',
      totalTokens: '総トークン数',
      avgPerTurn: 'ターン平均',
      peakUsage: 'ピーク使用率',
      estTurnsLeft: '推定残りターン',
      importJson: 'JSONインポート',
      exportJson: 'JSONエクスポート',
      clearData: 'データクリア',
      turnNumber: 'ターン',
      playReplay: '再生',
      pauseReplay: '一時停止',
      resetReplay: 'リセット',
    },
  };

  // Preset key mapping (index -> translation key for name & description)
  const presetKeys = [
    { name: 'presetLightChat', desc: 'presetLightChatDesc' },
    { name: 'presetLongConversation', desc: 'presetLongConversationDesc' },
    { name: 'presetToolHeavy', desc: 'presetToolHeavyDesc' },
    { name: 'presetNearLimit', desc: 'presetNearLimitDesc' },
  ];

  let currentLang = 'en';

  /**
   * Detect the best language from browser settings.
   */
  function detectLanguage() {
    const browserLangs = navigator.languages || [navigator.language || 'en'];
    for (const lang of browserLangs) {
      const normalized = lang.trim();
      // Exact match
      if (translations[normalized]) return normalized;
      // zh-CN, zh-Hans, zh-SG, zh -> zh-CN
      if (normalized.startsWith('zh')) return 'zh-CN';
      // ja-JP, ja -> ja
      if (normalized.startsWith('ja')) return 'ja';
      // en-US, en-GB, en -> en
      if (normalized.startsWith('en')) return 'en';
    }
    return 'en';
  }

  /**
   * Initialize i18n: load saved preference or detect browser language.
   */
  function init() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && translations[saved]) {
        currentLang = saved;
      } else {
        currentLang = detectLanguage();
      }
    } catch (e) {
      currentLang = detectLanguage();
    }
    applyTranslations();
    buildLanguageSelector();
  }

  /**
   * Get a translation string for the current language.
   */
  function t(key) {
    const langStrings = translations[currentLang] || translations.en;
    return langStrings[key] || translations.en[key] || key;
  }

  /**
   * Set the active language and re-apply translations.
   */
  function setLanguage(lang) {
    if (!translations[lang]) return;
    currentLang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
    applyTranslations();
    updateLanguageSelector();
  }

  /**
   * Get the current language code.
   */
  function getLanguage() {
    return currentLang;
  }

  /**
   * Get preset translation keys by index.
   */
  function getPresetKeys(index) {
    return presetKeys[index] || null;
  }

  /**
   * Apply all translations to the DOM.
   */
  function applyTranslations() {
    // Update HTML lang attribute
    document.documentElement.lang = currentLang === 'zh-CN' ? 'zh-CN' : currentLang;

    // Header
    const headerTitle = document.querySelector('.header__title');
    if (headerTitle) headerTitle.textContent = t('headerTitle');

    const headerSubtitle = document.querySelector('.header__subtitle');
    if (headerSubtitle) headerSubtitle.textContent = t('headerSubtitle');

    // Compare button
    const compareBtnText = document.querySelector('#compare-toggle span');
    if (compareBtnText) compareBtnText.textContent = t('compare');
    const compareToggleBtn = document.getElementById('compare-toggle');
    if (compareToggleBtn) compareToggleBtn.setAttribute('aria-label', t('compare'));

    // Category labels in token cards
    const categoryMap = {
      system: 'systemPrompt',
      user: 'userMessages',
      assistant: 'assistantOutput',
      tools: 'toolUse',
    };

    document.querySelectorAll('.token-card').forEach(card => {
      const cat = card.dataset.category;
      const labelEl = card.querySelector('.token-card__label');
      if (labelEl && categoryMap[cat]) {
        labelEl.textContent = t(categoryMap[cat]);
      }
    });

    // Slider section title
    const slidersTitle = document.querySelector('.sliders-card__title');
    if (slidersTitle) slidersTitle.textContent = t('adjustTokenAllocation');

    // Slider labels
    const sliderLabelMap = {
      system: 'sliderSystem',
      user: 'sliderUser',
      assistant: 'sliderAssistant',
      tools: 'sliderTools',
    };

    document.querySelectorAll('.slider-row').forEach(row => {
      const cat = row.dataset.category;
      const label = row.querySelector('.slider-label');
      if (label && sliderLabelMap[cat]) {
        // Preserve the colored dot span
        const dot = label.querySelector('.slider-label__dot');
        if (dot) {
          label.textContent = '';
          label.appendChild(dot);
          label.appendChild(document.createTextNode(' ' + t(sliderLabelMap[cat])));
        }
      }
    });

    // Presets card title
    const presetsTitle = document.querySelector('.presets-card__title');
    if (presetsTitle) presetsTitle.textContent = t('quickPresets');

    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      const idx = parseInt(btn.dataset.presetIndex);
      const keys = getPresetKeys(idx);
      if (keys) {
        const iconSpan = btn.querySelector('.preset-btn__icon');
        const iconHTML = iconSpan ? iconSpan.outerHTML : '';
        btn.innerHTML = iconHTML + t(keys.name);
        btn.title = t(keys.desc);
      }
    });

    // Stats bar
    const statLabels = document.querySelectorAll('.stat-item__label');
    const statKeys = ['totalUsed', 'remaining', 'contextWindow', 'outputLimit'];
    statLabels.forEach((label, i) => {
      if (statKeys[i]) label.textContent = t(statKeys[i]);
    });

    // Status indicators
    document.querySelectorAll('.gauge-status').forEach(status => {
      const textEl = status.querySelector('.gauge-status__text');
      if (textEl) {
        const currentText = textEl.textContent.trim();
        // Map current English text to key, or detect from classes
        if (status.classList.contains('gauge-status--danger')) {
          textEl.textContent = t('statusCritical');
        } else if (status.classList.contains('gauge-status--warning')) {
          textEl.textContent = t('statusWarning');
        } else {
          textEl.textContent = t('statusNormal');
        }
      }
    });

    // Timeline
    const timelineTitle = document.querySelector('.timeline-title');
    if (timelineTitle) timelineTitle.textContent = t('usageTimeline');

    const timelineEmpty = document.querySelector('.timeline-empty');
    if (timelineEmpty) timelineEmpty.textContent = t('adjustSlidersToRecord');

    // Timeline axis labels
    const axisLabels = document.querySelectorAll('.timeline-axis span');
    if (axisLabels.length >= 2) {
      axisLabels[0].textContent = t('oldest');
      axisLabels[1].textContent = t('latest');
    }

    // Footer
    const footerParagraphs = document.querySelectorAll('.footer > p');
    footerParagraphs.forEach(p => {
      const link = p.querySelector('a[href*="Zey413"]');
      if (link) {
        p.innerHTML = t('footerBuiltWith') + ' <a href="https://github.com/Zey413" target="_blank" rel="noopener">@Zey413</a>';
      }
    });

    const footerHint = document.querySelector('.footer__hint');
    if (footerHint) {
      footerHint.innerHTML = t('footerKeyboard') + ' <kbd>R</kbd> ' + t('footerReset') +
        ' &middot; <kbd>1</kbd>-<kbd>4</kbd> ' + t('footerPresets') +
        ' &middot; <kbd>C</kbd> ' + t('footerCompare') +
        ' &middot; <kbd>D</kbd> ' + t('footerDashboard');
    }

    // Action bar buttons
    const btnExportPng = document.getElementById('btn-export-png');
    if (btnExportPng) {
      const span = btnExportPng.querySelector('span');
      if (span) span.textContent = t('exportPng');
      btnExportPng.title = t('exportPngTitle');
    }

    const btnShareLink = document.getElementById('btn-share-link');
    if (btnShareLink) {
      const span = btnShareLink.querySelector('span');
      if (span) span.textContent = t('shareLink');
      btnShareLink.title = t('shareLinkTitle');
    }

    const btnCopyStats = document.getElementById('btn-copy-stats');
    if (btnCopyStats) {
      const span = btnCopyStats.querySelector('span');
      if (span) span.textContent = t('copyStats');
      btnCopyStats.title = t('copyStatsTitle');
    }

    // Gauge center label
    document.querySelectorAll('.gauge-center-label').forEach(el => {
      el.textContent = t('contextUsed');
    });

    // Update page title
    document.title = t('headerTitle') + ' - Claude';
  }

  /**
   * Initialize the language selector dropdown in the footer area.
   * Uses the existing #lang-select element if present, otherwise creates one.
   */
  function buildLanguageSelector() {
    // Try to use the existing lang-select in the HTML
    const existingSelect = document.getElementById('lang-select');
    if (existingSelect) {
      existingSelect.value = currentLang;
      existingSelect.setAttribute('aria-label', t('language'));
      // Only add listener if not already attached
      if (!existingSelect.dataset.i18nBound) {
        existingSelect.addEventListener('change', () => {
          setLanguage(existingSelect.value);
        });
        existingSelect.dataset.i18nBound = 'true';
      }
      return;
    }

    // Fallback: create a language selector dynamically
    const footer = document.querySelector('.footer');
    if (!footer) return;

    // Don't duplicate
    if (document.getElementById('lang-selector-wrapper')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'lang-selector-wrapper';
    wrapper.classList.add('lang-selector-wrapper');

    const label = document.createElement('label');
    label.setAttribute('for', 'lang-select-dynamic');
    label.classList.add('lang-selector-label');
    label.textContent = '🌐';
    label.setAttribute('aria-label', t('language'));

    const selectWrap = document.createElement('div');
    selectWrap.classList.add('select-wrapper', 'lang-select-wrapper');

    const select = document.createElement('select');
    select.id = 'lang-select-dynamic';
    select.classList.add('lang-select');
    select.setAttribute('aria-label', t('language'));

    const languages = [
      { code: 'en', label: 'English' },
      { code: 'zh-CN', label: '\u4E2D\u6587\u7B80\u4F53' },
      { code: 'ja', label: '\u65E5\u672C\u8A9E' },
    ];

    languages.forEach(lang => {
      const opt = document.createElement('option');
      opt.value = lang.code;
      opt.textContent = lang.label;
      if (lang.code === currentLang) opt.selected = true;
      select.appendChild(opt);
    });

    const arrow = document.createElement('span');
    arrow.classList.add('select-arrow');
    arrow.textContent = '\u25BE';

    selectWrap.appendChild(select);
    selectWrap.appendChild(arrow);

    wrapper.appendChild(label);
    wrapper.appendChild(selectWrap);
    footer.appendChild(wrapper);

    select.addEventListener('change', () => {
      setLanguage(select.value);
    });
  }

  /**
   * Update the language selector to reflect the current language.
   */
  function updateLanguageSelector() {
    // Update existing HTML select
    const select = document.getElementById('lang-select');
    if (select) {
      select.value = currentLang;
      select.setAttribute('aria-label', t('language'));
    }
    // Update dynamically-created select if present
    const dynamicSelect = document.getElementById('lang-select-dynamic');
    if (dynamicSelect) {
      dynamicSelect.value = currentLang;
      dynamicSelect.setAttribute('aria-label', t('language'));
    }
    const label = document.querySelector('.lang-selector-label');
    if (label) label.setAttribute('aria-label', t('language'));
  }

  // Public API
  return {
    init,
    t,
    setLanguage,
    getLanguage,
    getPresetKeys,
    applyTranslations,
  };
})();
