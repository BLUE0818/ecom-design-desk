// 电商AI图片提示词生成器 - Vue 3 主应用（三栏AI聊天风格）
const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

// ============ 会话工厂 ============
function createSession() {
  return {
    id: 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name: formatSessionTime(new Date()),
    createdAt: new Date().toISOString(),
    messages: [],
    stepData: {
      formData: {
        platform: '', imageType: '', productName: '', category: '',
        specs: '', sellingPoints: '', targetAudience: '', usageScene: '',
        priceRange: '', brandName: '', brandElements: '',
        avoidContent: '', productVersion: '', visualNotes: ''
      },
      productImage: null,
      competitorResearch: null,
      variableSuggestion: null,
      creativeConfirmation: { style: '', mainImageCount: '', detailScreenCount: '', contentRhythm: '' },
      differentiationStrategy: null,
      platformSizeAdvice: null,
      finalPrompts: null,
      mainImagePrompts: [],
      detailPrompts: []
    },
    currentStep: 0,
    completedSteps: []
  };
}

function formatSessionTime(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STORAGE_KEY = 'ecom-prompt-gen-sessions';
const SETTINGS_KEY = 'ecom-prompt-gen-settings';

const PLATFORM_NAMES = {
  taobao: '淘宝', tmall: '天猫', jd: '京东', pdd: '拼多多',
  douyin: '抖音电商', xiaohongshu: '小红书', '1688': '1688', amazon: '亚马逊'
};

const PROVIDER_PRESETS = {
  openai:      { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  deepseek:    { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  siliconflow: { baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
  qwen:        { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' }
};

const STEPS = [
  { label: '固定输入', icon: '📋' },
  { label: '竞品研究', icon: '🔍' },
  { label: '变量推荐', icon: '🎯' },
  { label: '差异化策略', icon: '💡' },
  { label: '平台尺寸', icon: '📐' },
  { label: '提示词生成', icon: '✨' }
];

// ============ Vue App ============
const app = createApp({
  setup() {

    // -------- 全局状态 --------
    const showSettings = ref(false);
    const isProcessing = ref(false);
    const userInput = ref('');
    const manualCompetitorInfo = ref('');
    const activeArtifact = ref(null);  // { title, content, editable, stepIndex, msgIndex }
    const chatMessages = ref(null);
    const chatInput = ref(null);
    const fileInput = ref(null);

    // -------- 会话管理 --------
    const sessions = ref([]);
    const activeSessionId = ref(null);

    const activeSession = computed(() =>
      sessions.value.find(s => s.id === activeSessionId.value) || null
    );

    const sessionsSorted = computed(() =>
      [...sessions.value].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    );

    const stepProgressPercent = computed(() => {
      if (!activeSession.value) return 0;
      const done = (activeSession.value.completedSteps || []).length;
      return (done / 6) * 100;
    });

    // -------- 设置 --------
    const settings = reactive({
      llm: { apiMode: 'chat-completions', provider: 'custom', baseUrl: '', apiKey: '', model: '' },
      image: { apiMode: 'images', baseUrl: '', apiKey: '', model: 'gpt-image-2' },
      search: { enabled: false, apiKey: '' }
    });

    const searchConfigured = computed(() => settings.search.enabled && settings.search.apiKey);

    const isFormValid = computed(() => {
      if (!activeSession.value) return false;
      const fd = activeSession.value.stepData.formData;
      return fd.platform && fd.imageType && fd.productName && fd.category &&
             fd.specs && fd.sellingPoints && fd.targetAudience && fd.usageScene && fd.priceRange;
    });

    const searchKeywords = computed(() => {
      if (!activeSession.value) return '';
      const fd = activeSession.value.stepData.formData;
      const parts = [];
      if (fd.platform) parts.push(PLATFORM_NAMES[fd.platform] || fd.platform);
      if (fd.category) parts.push(fd.category);
      if (fd.productName) parts.push(fd.productName);
      return parts.join(' ') || '';
    });

    // ============ 会话 CRUD ============

    function persistSessions() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.value));
    }

    function loadSessions() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) sessions.value = JSON.parse(raw);
      } catch { sessions.value = []; }
    }

    function createSession_() {
      const s = createSession();
      sessions.value.push(s);
      activeSessionId.value = s.id;
      // 欢迎消息 + 表单
      addMsg(s, 'assistant', 'text', '你好！我是电商AI图片提示词生成助手 ✨\n请在下方填写产品信息，填写完成后点击提交，我将为你进行专业的电商视觉分析。');
      addMsg(s, 'assistant', 'form-input', '');
      persistSessions();
      scrollChat();
    }

    function selectSession(id) {
      activeSessionId.value = id;
      activeArtifact.value = null;
      nextTick(() => scrollChat());
    }

    function deleteSession_(id) {
      const idx = sessions.value.findIndex(s => s.id === id);
      if (idx === -1) return;
      sessions.value.splice(idx, 1);
      if (activeSessionId.value === id) {
        activeSessionId.value = sessions.value.length ? sessions.value[0].id : null;
      }
      activeArtifact.value = null;
      persistSessions();
    }

    // ============ 消息工具 ============

    function addMsg(session, role, type, content, extra) {
      session.messages.push({ role, type, content, timestamp: Date.now(), ...extra });
      persistSessions();
      nextTick(() => scrollChat());
    }

    function removeLoadingMsg(session) {
      const idx = session.messages.findIndex(m => m.type === 'loading');
      if (idx !== -1) session.messages.splice(idx, 1);
    }

    function scrollChat() {
      const el = chatMessages.value;
      if (el) el.scrollTop = el.scrollHeight;
    }

    // ============ 步骤访问 ============

    function canAccessStep(index) {
      if (!activeSession.value) return false;
      if (index === 0) return true;
      return (activeSession.value.completedSteps || []).includes(index - 1);
    }

    function goToStep(index) {
      // 纯展示，不跳转步骤
    }

    function markStepDone(session, stepIndex) {
      if (!session.completedSteps.includes(stepIndex)) {
        session.completedSteps.push(stepIndex);
      }
      session.currentStep = stepIndex + 1;
      persistSessions();
    }

    // ============ Step 1: 提交产品信息 ============

    function submitStep1() {
      const s = activeSession.value;
      if (!s || !isFormValid.value) return;

      const fd = s.stepData.formData;
      addMsg(s, 'user', 'user', `已提交产品信息：${fd.productName}（${PLATFORM_NAMES[fd.platform] || fd.platform}）`);

      // 生成输入确认卡
      const imageTypeNames = { main: '主图', detail: '详情页', both: '主图 + 详情页' };
      const summary = buildInputSummary(fd, s.stepData.productImage, imageTypeNames);

      addMsg(s, 'assistant', 'text', '📋 产品信息已收到！以下是输入确认：');

      // 添加卡片
      addMsg(s, 'assistant', 'card', summary, {
        title: '📋 产品信息汇总',
        stepIndex: 0,
        cardType: 'input-summary'
      });

      markStepDone(s, 0);

      // 进入 Step 2
      addMsg(s, 'assistant', 'text', '接下来进入 **Step 2: 竞品研究**。请选择研究方式：');
      addMsg(s, 'assistant', 'research-choice', '请选择竞品研究方式：');

      scrollChat();
    }

    function buildInputSummary(fd, image, imageTypeNames) {
      return `【产品信息汇总】

一、主视觉输入
- 主输入图片：${image ? '已上传' : '未上传'}
- 产品版本：${fd.productVersion || '未填写'}
- 视觉备注：${fd.visualNotes || '无'}

二、平台与任务范围
- 目标平台：${PLATFORM_NAMES[fd.platform] || fd.platform}
- 图片类型：${imageTypeNames[fd.imageType] || fd.imageType}

三、产品基础信息
- 产品名称：${fd.productName}
- 产品类目：${fd.category}
- 核心参数：${fd.specs}

四、销售表达锚点
- 核心卖点：${fd.sellingPoints}
- 目标人群：${fd.targetAudience}
- 使用场景：${fd.usageScene}
- 价格带：${fd.priceRange}

五、品牌与合规
- 品牌名：${fd.brandName || '无'}
- 品牌元素：${fd.brandElements || '无'}
- 避忌内容：${fd.avoidContent || '无'}`;
    }

    // ============ Step 2: 竞品研究 ============

    async function startAutoResearch() {
      const s = activeSession.value;
      if (!s || !searchConfigured.value) return;

      addMsg(s, 'user', 'user', '选择自动搜索研究');
      addMsg(s, 'assistant', 'loading', '正在搜索竞品信息...');
      isProcessing.value = true;

      try {
        const searchResult = await ApiClient.callTavilySearch(searchKeywords.value, { maxResults: 10 });

        let competitorInfo = '以下是联网搜索到的竞品信息：\n\n';
        if (searchResult.results?.length) {
          searchResult.results.forEach((r, i) => {
            competitorInfo += `### 竞品${i + 1}: ${r.title}\n- 链接: ${r.url}\n- 摘要: ${r.content}\n\n`;
          });
        }
        if (searchResult.answer) competitorInfo += `### 搜索摘要\n${searchResult.answer}\n\n`;

        removeLoadingMsg(s);
        addMsg(s, 'assistant', 'loading', '正在使用AI分析竞品...');

        const result = await ApiClient.callTextLLM(buildCompetitorPrompt(s, competitorInfo), STEP2_SYSTEM_PROMPT, { maxTokens: 4096 });
        s.stepData.competitorResearch = result;

        removeLoadingMsg(s);
        addMsg(s, 'assistant', 'text', '🔍 竞品研究完成！');
        addMsg(s, 'assistant', 'card', result, { title: '🔍 竞品研究结构化摘要', stepIndex: 1, cardType: 'competitor-research' });

        markStepDone(s, 1);
        await autoAdvanceStep3(s);

      } catch (e) {
        removeLoadingMsg(s);
        addMsg(s, 'assistant', 'text', `❌ 竞品研究失败：${e.message}`);
      } finally {
        isProcessing.value = false;
        persistSessions();
      }
    }

    function startManualResearch() {
      const s = activeSession.value;
      if (!s) return;
      addMsg(s, 'user', 'user', '选择手动输入竞品信息');
      addMsg(s, 'assistant', 'manual-input', '');
      scrollChat();
    }

    async function submitManualResearch() {
      const s = activeSession.value;
      if (!s || !manualCompetitorInfo.value.trim()) return;

      addMsg(s, 'user', 'user', '已提交竞品信息');
      addMsg(s, 'assistant', 'loading', '正在分析竞品信息...');
      isProcessing.value = true;

      try {
        const result = await ApiClient.callTextLLM(buildCompetitorPrompt(s, manualCompetitorInfo.value), STEP2_SYSTEM_PROMPT, { maxTokens: 4096 });
        s.stepData.competitorResearch = result;
        manualCompetitorInfo.value = '';

        removeLoadingMsg(s);
        addMsg(s, 'assistant', 'text', '🔍 竞品分析完成！');
        addMsg(s, 'assistant', 'card', result, { title: '🔍 竞品研究结构化摘要', stepIndex: 1, cardType: 'competitor-research' });

        markStepDone(s, 1);
        await autoAdvanceStep3(s);

      } catch (e) {
        removeLoadingMsg(s);
        addMsg(s, 'assistant', 'text', `❌ 竞品分析失败：${e.message}`);
      } finally {
        isProcessing.value = false;
        persistSessions();
      }
    }

    function buildCompetitorPrompt(s, competitorInfo) {
      const fd = s.stepData.formData;
      return `请基于以下产品信息和竞品资料，进行竞品分析：

## 产品信息
- 目标平台：${PLATFORM_NAMES[fd.platform] || fd.platform}
- 产品名称：${fd.productName}
- 产品类目：${fd.category}
- 核心参数：${fd.specs}
- 核心卖点：${fd.sellingPoints}
- 目标人群：${fd.targetAudience}
- 使用场景：${fd.usageScene}
- 价格带：${fd.priceRange}

## 竞品资料
${competitorInfo}

请按照系统提示词的格式要求，输出《竞品研究结构化摘要》。`;
    }

    // ============ Step 3: 变量推荐（自动） ============

    async function autoAdvanceStep3(s) {
      addMsg(s, 'assistant', 'text', '正在进入 **Step 3: 变量推荐**，AI正在分析最佳创意方向...');
      addMsg(s, 'assistant', 'loading', '正在生成变量推荐...');
      isProcessing.value = true;

      try {
        const fd = s.stepData.formData;
        const comp = s.stepData.competitorResearch || '';

        const imageTypeLabel = { main: '仅主图', detail: '仅详情页', both: '主图 + 详情页' }[fd.imageType] || fd.imageType;

        const userPrompt = `请基于以下产品信息和竞品研究结果，推荐最佳的创意变量：

## 产品信息
- 目标平台：${PLATFORM_NAMES[fd.platform] || fd.platform}
- 图片类型需求：${imageTypeLabel}
- 产品名称：${fd.productName}
- 产品类目：${fd.category}
- 核心参数：${fd.specs}
- 核心卖点：${fd.sellingPoints}
- 目标人群：${fd.targetAudience}
- 使用场景：${fd.usageScene}
- 价格带：${fd.priceRange}

## 竞品研究结果
${comp || '暂无'}

## 重要约束
用户选择的图片类型为「${imageTypeLabel}」。${fd.imageType === 'main' ? '用户只需要主图，请只推荐主图相关的变量（主图张数等），不要推荐详情页相关内容。' : fd.imageType === 'detail' ? '用户只需要详情页，请只推荐详情页相关的变量（详情页屏数等），不要推荐主图相关内容。' : '用户需要主图和详情页，请分别推荐两者的变量。'}

请按照系统提示词的格式要求，输出《变量建议卡》。`;

        const result = await ApiClient.callTextLLM(userPrompt, STEP3_SYSTEM_PROMPT, { maxTokens: 3000 });
        s.stepData.variableSuggestion = result;

        // 尝试自动提取推荐值
        const styleMatch = result.match(/视觉风格.*?推荐值[：:]\s*([^\n]+)/);
        const mainMatch = result.match(/主图张数.*?推荐值[：:]\s*(\d+)/);
        const detailMatch = result.match(/详情页屏数.*?推荐值[：:]\s*(\d+)/);
        const rhythmMatch = result.match(/内容节奏.*?推荐值[：:]\s*([^\n]+)/);

        s.stepData.creativeConfirmation = {
          style: styleMatch ? styleMatch[1].trim() : '',
          mainImageCount: mainMatch ? mainMatch[1] + '张' : '',
          detailScreenCount: detailMatch ? detailMatch[1] + '屏' : '',
          contentRhythm: rhythmMatch ? rhythmMatch[1].trim() : ''
        };

        removeLoadingMsg(s);
        addMsg(s, 'assistant', 'text', '🎯 变量推荐完成！请确认或调整以下变量：');
        addMsg(s, 'assistant', 'card', result, { title: '🎯 变量建议卡', stepIndex: 2, cardType: 'variable-suggestion' });
        addMsg(s, 'assistant', 'variable-confirm', '请确认创意变量：');

      } catch (e) {
        removeLoadingMsg(s);
        addMsg(s, 'assistant', 'text', `❌ 变量推荐失败：${e.message}`);
      } finally {
        isProcessing.value = false;
        persistSessions();
      }
    }

    async function confirmVariables() {
      const s = activeSession.value;
      if (!s) return;

      const cc = s.stepData.creativeConfirmation;
      addMsg(s, 'user', 'user', `已确认变量：风格=${cc.style}，主图=${cc.mainImageCount}，详情=${cc.detailScreenCount}，节奏=${cc.contentRhythm}`);

      markStepDone(s, 2);
      await autoAdvanceStep4(s);
    }

    // ============ Step 4: 差异化策略（自动） ============

    async function autoAdvanceStep4(s) {
      addMsg(s, 'assistant', 'text', '正在进入 **Step 4: 差异化策略**...');
      addMsg(s, 'assistant', 'loading', '正在生成差异化策略...');
      isProcessing.value = true;

      try {
        const fd = s.stepData.formData;
        const cc = s.stepData.creativeConfirmation;
        const comp = s.stepData.competitorResearch || '';
        const imageTypeLabel = { main: '仅主图', detail: '仅详情页', both: '主图 + 详情页' }[fd.imageType] || fd.imageType;

        const userPrompt = `请基于以下信息生成差异化策略：

## 产品信息
- 目标平台：${PLATFORM_NAMES[fd.platform] || fd.platform}
- 图片类型需求：${imageTypeLabel}
- 产品名称：${fd.productName}
- 产品类目：${fd.category}
- 核心参数：${fd.specs}
- 核心卖点：${fd.sellingPoints}
- 目标人群：${fd.targetAudience}
- 使用场景：${fd.usageScene}
- 价格带：${fd.priceRange}

## 竞品研究结果
${comp || '暂无'}

## 已确认的变量
- 视觉风格：${cc.style || '待确认'}
- 主图张数：${cc.mainImageCount || '待确认'}
- 详情页屏数：${cc.detailScreenCount || '待确认'}
- 内容节奏：${cc.contentRhythm || '待确认'}

## 重要约束
用户选择的图片类型为「${imageTypeLabel}」。${fd.imageType === 'main' ? '用户只需要主图，请只输出主图相关的差异化策略，不要输出详情页相关内容。' : fd.imageType === 'detail' ? '用户只需要详情页，请只输出详情页相关的差异化策略，不要输出主图相关内容。' : '用户需要主图和详情页，请分别输出两者的差异化策略。'}

请按照系统提示词的格式要求，输出完整的《差异化策略》文档。`;

        const result = await ApiClient.callTextLLM(userPrompt, STEP4_SYSTEM_PROMPT, { maxTokens: 4096 });
        s.stepData.differentiationStrategy = result;

        removeLoadingMsg(s);
        addMsg(s, 'assistant', 'text', '💡 差异化策略生成完成！');
        addMsg(s, 'assistant', 'card', result, { title: '💡 差异化策略', stepIndex: 3, cardType: 'strategy' });

        markStepDone(s, 3);
        await autoAdvanceStep5(s);

      } catch (e) {
        removeLoadingMsg(s);
        addMsg(s, 'assistant', 'text', `❌ 差异化策略生成失败：${e.message}`);
      } finally {
        isProcessing.value = false;
        persistSessions();
      }
    }

    // ============ Step 5: 平台尺寸（纯查表） ============

    async function autoAdvanceStep5(s) {
      const fd = s.stepData.formData;
      let sizeAdvice = null;
      if (fd.platform && window.PLATFORM_SIZE_TABLE) {
        sizeAdvice = window.PLATFORM_SIZE_TABLE[fd.platform] || null;
      }
      s.stepData.platformSizeAdvice = sizeAdvice;

      if (sizeAdvice) {
        const sizeText = `【平台尺寸建议】

- 平台：${PLATFORM_NAMES[fd.platform]}
- 主图尺寸：${sizeAdvice.mainImage.width}×${sizeAdvice.mainImage.height}px
- 主图比例：${sizeAdvice.mainImage.ratio}
- 主图格式：${sizeAdvice.mainImage.format}
- 详情页宽度：${sizeAdvice.detailPage.width}px
- 详情页每屏高度：${sizeAdvice.detailPage.heightRange}px
- 详情页格式：${sizeAdvice.detailPage.format}
${sizeAdvice.notes ? '- 备注：' + sizeAdvice.notes : ''}`;

        addMsg(s, 'assistant', 'text', '📐 平台尺寸适配完成（自动查表）：');
        addMsg(s, 'assistant', 'card', sizeText, { title: '📐 平台尺寸建议', stepIndex: 4, cardType: 'platform-size' });
      } else {
        addMsg(s, 'assistant', 'text', '📐 Step 5: 该平台暂无专用尺寸数据，将使用通用尺寸。');
      }

      markStepDone(s, 4);
      await autoAdvanceStep6(s);
    }

    // ============ Step 6: 提示词生成（自动） ============

    async function autoAdvanceStep6(s) {
      addMsg(s, 'assistant', 'text', '正在进入 **Step 6: 提示词生成**，这是最后一步！');
      addMsg(s, 'assistant', 'loading', '正在生成可复制提示词...');
      isProcessing.value = true;

      try {
        const fd = s.stepData.formData;
        const cc = s.stepData.creativeConfirmation;
        const comp = s.stepData.competitorResearch || '';
        const strat = s.stepData.differentiationStrategy || '';
        const ps = s.stepData.platformSizeAdvice;
        const imageTypeLabel = { main: '仅主图', detail: '仅详情页', both: '主图 + 详情页' }[fd.imageType] || fd.imageType;

        // 根据 imageType 构建约束指令
        let imageTypeConstraint = '';
        if (fd.imageType === 'main') {
          imageTypeConstraint = `
## ⚠️ 图片类型约束（必须严格遵守）
用户选择的图片类型为「仅主图」。你必须：
1. 只生成主图提示词（===主图X===），不要生成任何详情页提示词（===第X屏===）
2. 变量推荐中只保留主图张数，忽略详情页屏数
3. 差异化策略中只保留主图策略，忽略详情页屏结构
4. 如果系统提示词要求同时输出详情页，请忽略该要求，只输出主图部分`;
        } else if (fd.imageType === 'detail') {
          imageTypeConstraint = `
## ⚠️ 图片类型约束（必须严格遵守）
用户选择的图片类型为「仅详情页」。你必须：
1. 只生成详情页提示词（===第X屏===），不要生成任何主图提示词（===主图X===）
2. 变量推荐中只保留详情页屏数，忽略主图张数
3. 差异化策略中只保留详情页屏结构，忽略主图策略
4. 如果系统提示词要求同时输出主图，请忽略该要求，只输出详情页部分`;
        } else {
          imageTypeConstraint = `
## 图片类型
用户需要「主图 + 详情页」，请同时输出主图和详情页的完整提示词。`;
        }

        const userPrompt = `请基于以下信息生成可复制提示词：

## 产品信息
- 目标平台：${PLATFORM_NAMES[fd.platform] || fd.platform}
- 图片类型需求：${imageTypeLabel}
- 产品名称：${fd.productName}
- 产品类目：${fd.category}
- 核心参数：${fd.specs}
- 核心卖点：${fd.sellingPoints}
- 目标人群：${fd.targetAudience}
- 使用场景：${fd.usageScene}
- 价格带：${fd.priceRange}
- 品牌/店铺：${fd.brandName || '无品牌强调'}
- 必须保留元素：${fd.brandElements || '无特殊要求'}
- 必须避开内容：${fd.avoidContent || '无限制'}
- 产品版本：${fd.productVersion || '未指定'}
- 视觉注意事项：${fd.visualNotes || '无'}

## 竞品研究结果
${comp || '暂无'}

## 平台尺寸建议
- 主图尺寸：${ps ? ps.mainImage.width + '×' + ps.mainImage.height + 'px' : '800×800px'}
- 主图比例：${ps ? ps.mainImage.ratio : '1:1'}
- 详情页宽度：${ps ? ps.detailPage.width + 'px' : '750px'}
- 详情页每屏高度：${ps ? ps.detailPage.heightRange + 'px' : '1000-1500px'}

## 已确认的变量
- 视觉风格：${cc.style || '待确认'}
- 主图张数：${cc.mainImageCount || '待确认'}
- 详情页屏数：${cc.detailScreenCount || '待确认'}
- 内容节奏：${cc.contentRhythm || '待确认'}

## 差异化策略
${strat || '暂无'}
${imageTypeConstraint}

请按照系统提示词的格式要求，使用 ===主图X=== 和 ===第X屏=== 分隔符，输出提示词。${fd.imageType === 'main' ? '注意：只输出主图提示词，不要输出详情页。' : fd.imageType === 'detail' ? '注意：只输出详情页提示词，不要输出主图。' : ''}`;

        const result = await ApiClient.callTextLLM(userPrompt, STEP6_SYSTEM_PROMPT, { maxTokens: 8192 });
        s.stepData.finalPrompts = result;
        parsePrompts(s, result);

        removeLoadingMsg(s);

        // 为每张提示词生成独立的 prompt-card 消息
        const mainPrompts = s.stepData.mainImagePrompts || [];
        const detailPromptsList = s.stepData.detailPrompts || [];

        if (mainPrompts.length === 0 && detailPromptsList.length === 0) {
          // 解析失败，降级为单个大卡片
          addMsg(s, 'assistant', 'text', '✨ 提示词已生成（未能拆分为独立卡片，以整体展示）：');
          addMsg(s, 'assistant', 'card', result, { title: '✨ 完整提示词', stepIndex: 5, cardType: 'final-prompts' });
        } else {
          if (mainPrompts.length > 0) {
            addMsg(s, 'assistant', 'text', `✨ 主图提示词已拆分为 ${mainPrompts.length} 张卡片，可直接编辑和生成图片：`);
            mainPrompts.forEach((p, i) => {
              const meta = [p.goal, p.size, p.ratio].filter(Boolean).join(' · ');
              addMsg(s, 'assistant', 'prompt-card', p.text, {
                cardLabel: `主图 ${i + 1}`,
                cardMeta: meta,
                generating: false,
                imageUrl: null,
                genError: null
              });
            });
          }
          if (detailPromptsList.length > 0) {
            addMsg(s, 'assistant', 'text', `✨ 详情页提示词已拆分为 ${detailPromptsList.length} 张卡片：`);
            detailPromptsList.forEach((p, i) => {
              const meta = [p.goal, p.size, p.layout].filter(Boolean).join(' · ');
              addMsg(s, 'assistant', 'prompt-card', p.text, {
                cardLabel: `第 ${i + 1} 屏`,
                cardMeta: meta,
                generating: false,
                imageUrl: null,
                genError: null
              });
            });
          }
        }

        markStepDone(s, 5);

      } catch (e) {
        removeLoadingMsg(s);
        addMsg(s, 'assistant', 'text', `❌ 提示词生成失败：${e.message}`);
      } finally {
        isProcessing.value = false;
        persistSessions();
      }
    }

    // 解析提示词到 session.stepData
    function parsePrompts(s, text) {
      const mainPrompts = [];
      const mainRegex = /===主图(\d+)===[\s\S]*?(?====主图\d+===|===第\d+屏===|$)/g;
      let m;
      while ((m = mainRegex.exec(text)) !== null) {
        const block = m[0];
        const g = block.match(/- 图片目标[：:]\s*(.*)/);
        const sz = block.match(/- 适用尺寸建议[：:]\s*(.*)/);
        const r = block.match(/- 推荐比例[：:]\s*(.*)/);
        const t = block.match(/- 可复制提示词[：:]\s*([\s\S]*?)(?=- 建议文案占位|- 执行提醒|$)/);
        mainPrompts.push({
          goal: g?.[1] || '', size: sz?.[1] || '', ratio: r?.[1] || '',
          text: t?.[1]?.trim() || block
        });
      }
      s.stepData.mainImagePrompts = mainPrompts;

      const detailPromptsList = [];
      const detailRegex = /===第(\d+)屏===[\s\S]*?(?====第\d+屏===|$)/g;
      while ((m = detailRegex.exec(text)) !== null) {
        const block = m[0];
        const g = block.match(/- 本屏目标[：:]\s*(.*)/);
        const sz = block.match(/- 适用尺寸建议[：:]\s*(.*)/);
        const l = block.match(/- 推荐比例\/版式[：:]\s*(.*)/);
        const t = block.match(/- 可复制提示词[：:]\s*([\s\S]*?)(?=- 建议文案占位|- 执行提醒|$)/);
        detailPromptsList.push({
          goal: g?.[1] || '', size: sz?.[1] || '', layout: l?.[1] || '',
          text: t?.[1]?.trim() || block
        });
      }
      s.stepData.detailPrompts = detailPromptsList;
    }

    // ============ 提示词卡片操作 ============

    function updatePromptCardText(msgIndex, newText) {
      const s = activeSession.value;
      if (!s || msgIndex < 0 || msgIndex >= s.messages.length) return;
      s.messages[msgIndex].content = newText;
      persistSessions();
    }

    function copyPromptCard(msgIndex) {
      const s = activeSession.value;
      if (!s || msgIndex < 0 || msgIndex >= s.messages.length) return;
      const text = s.messages[msgIndex].content;
      navigator.clipboard?.writeText(text).then(() => {
        alert('已复制到剪贴板！');
      }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert('已复制到剪贴板！');
      });
    }

    async function generateImageFromCard(msgIndex) {
      const s = activeSession.value;
      if (!s || msgIndex < 0 || msgIndex >= s.messages.length) return;
      const msg = s.messages[msgIndex];
      const promptText = msg.content;
      const imageBase64 = s.stepData.productImage;

      if (!imageBase64) {
        msg.genError = '请先在 Step 1 上传产品图片';
        persistSessions();
        return;
      }

      msg.generating = true;
      msg.genError = null;
      msg.imageUrl = null;
      persistSessions();

      try {
        const imageUrl = await ApiClient.callImageGeneration(promptText, imageBase64);
        msg.imageUrl = imageUrl;
      } catch (e) {
        msg.genError = e.message || '图片生成失败';
      } finally {
        msg.generating = false;
        persistSessions();
      }
    }

    // ============ 用户自由聊天 ============

    async function sendUserMessage() {
      const s = activeSession.value;
      const text = userInput.value.trim();
      if (!s || !text || isProcessing.value) return;

      userInput.value = '';
      addMsg(s, 'user', 'user', text);

      // 构建上下文
      const fd = s.stepData.formData;
      const contextLines = [];
      if (fd.productName) contextLines.push(`产品：${fd.productName}，平台：${PLATFORM_NAMES[fd.platform] || fd.platform}`);
      if (s.stepData.competitorResearch) contextLines.push('已完成竞品研究');
      if (s.stepData.creativeConfirmation?.style) contextLines.push(`已确认变量：${s.stepData.creativeConfirmation.style}`);
      if (s.stepData.differentiationStrategy) contextLines.push('已完成差异化策略');
      if (s.stepData.finalPrompts) contextLines.push('已生成提示词');

      const systemContext = `你是一个专业的电商视觉策略AI助手。当前会话状态：${contextLines.join('；') || '刚开始'}。当前步骤：Step ${s.currentStep + 1}。请根据用户的问题给出专业、简洁的回答。如果用户要求修改之前的产出，请基于已有上下文进行调整。`;

      addMsg(s, 'assistant', 'loading', '思考中...');
      isProcessing.value = true;

      try {
        const result = await ApiClient.callTextLLM(text, systemContext, { maxTokens: 2048 });
        removeLoadingMsg(s);
        addMsg(s, 'assistant', 'text', result);
      } catch (e) {
        removeLoadingMsg(s);
        addMsg(s, 'assistant', 'text', `❌ 回复失败：${e.message}`);
      } finally {
        isProcessing.value = false;
      }
    }

    // ============ 右侧产物面板 ============

    function openArtifact(msg) {
      activeArtifact.value = {
        title: msg.title || '产物',
        content: msg.content,
        editable: true,
        stepIndex: msg.stepIndex,
        msgIndex: activeSession.value?.messages.indexOf(msg)
      };
    }

    function closeArtifact() { activeArtifact.value = null; }

    function copyArtifactContent() {
      if (!activeArtifact.value) return;
      const text = activeArtifact.value.content;
      navigator.clipboard?.writeText(text).then(() => {
        alert('已复制到剪贴板！');
      }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        alert('已复制到剪贴板！');
      });
    }

    function saveArtifactEdit() {
      if (!activeArtifact.value || !activeSession.value) return;
      const s = activeSession.value;
      const mi = activeArtifact.value.msgIndex;
      if (mi >= 0 && mi < s.messages.length) {
        s.messages[mi].content = activeArtifact.value.content;
      }
      // 同步到 stepData
      const st = activeArtifact.value.stepIndex;
      if (st === 1) s.stepData.competitorResearch = activeArtifact.value.content;
      if (st === 5) s.stepData.finalPrompts = activeArtifact.value.content;
      persistSessions();
      alert('修改已保存！');
    }

    // ============ 图片上传 ============

    function triggerUpload(event) {
      const container = event.currentTarget;
      const input = container.querySelector('input[type="file"]');
      if (input) input.click();
    }

    function handleFileSelect(e) {
      const file = e.target.files?.[0];
      if (file) processImage(file);
    }

    function handleDrop(e) {
      const file = e.dataTransfer.files?.[0];
      if (file?.type.startsWith('image/')) processImage(file);
    }

    function processImage(file) {
      const s = activeSession.value;
      if (!s) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        s.stepData.productImage = e.target.result;
        persistSessions();
      };
      reader.readAsDataURL(file);
    }

    // ============ 设置 ============

    function loadSettings() {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) {
          const p = JSON.parse(raw);
          Object.assign(settings.llm, p.llm || {});
          Object.assign(settings.image, p.image || {});
          Object.assign(settings.search, p.search || {});
        }
      } catch {}
    }

    function saveSettings() {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      showSettings.value = false;
    }

    function applyProviderPreset() {
      const preset = PROVIDER_PRESETS[settings.llm.provider];
      if (preset) {
        settings.llm.baseUrl = preset.baseUrl;
        settings.llm.model = preset.model;
      }
    }

    async function testLLMConnection() {
      try {
        await ApiClient.testLLMConnection();
        alert('连接成功！');
      } catch (e) {
        alert('连接失败: ' + e.message);
      }
    }

    async function testImageConnection() {
      try {
        await ApiClient.testImageConnection();
        alert('连接成功！');
      } catch (e) {
        alert('连接失败: ' + e.message);
      }
    }

    // ============ 工具函数 ============

    function getPreview(text) {
      if (!text) return '';
      return text.replace(/[\n\r]/g, ' ').substring(0, 120) + '...';
    }

    function formatMarkdown(text) {
      if (!text) return '';
      let html = text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
      return html;
    }

    function autoResize(e) {
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }

    // ============ 生命周期 ============

    onMounted(() => {
      loadSettings();
      loadSessions();
      if (sessions.value.length && !activeSessionId.value) {
        activeSessionId.value = sessions.value[0].id;
      }
    });

    // ============ 返回 ============

    return {
      // 全局
      showSettings, isProcessing, userInput, manualCompetitorInfo,
      activeArtifact, chatMessages, chatInput, fileInput,
      steps: STEPS,

      // 会话
      sessions, activeSessionId, activeSession, sessionsSorted, stepProgressPercent,
      createSession: createSession_, selectSession, deleteSession: deleteSession_,

      // 设置
      settings, searchConfigured,
      saveSettings, loadSettings, applyProviderPreset,
      testLLMConnection, testImageConnection,

      // 表单
      isFormValid, submitStep1,

      // 竞品
      startAutoResearch, startManualResearch, submitManualResearch,

      // 变量
      confirmVariables,

      // 右面板
      openArtifact, closeArtifact, copyArtifactContent, saveArtifactEdit,

      // 图片上传
      triggerUpload, handleFileSelect, handleDrop,

      // 聊天
      sendUserMessage,

      // 提示词卡片
      updatePromptCardText, copyPromptCard, generateImageFromCard,

      // 工具
      getPreview, formatMarkdown, autoResize,
      canAccessStep, goToStep
    };
  }
});

app.mount('#app');
