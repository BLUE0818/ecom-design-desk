// 电商AI图片提示词生成器 - API调用层
// 统一封装所有API调用，支持三种文本LLM模式和双图片API模式

const PROMPT_REWRITE_GUARD = 'Use the following text as the complete prompt. Do not rewrite it:';

const ApiClient = {
  getSettings() {
    const saved = localStorage.getItem('ecom-prompt-gen-settings');
    return saved ? JSON.parse(saved) : null;
  },

  // ============ 文本 LLM ============

  async callTextLLM(prompt, systemPrompt, options) {
    systemPrompt = systemPrompt || '';
    options = options || {};
    const settings = this.getSettings();
    if (!settings || !settings.llm || !settings.llm.apiKey) throw new Error('请先配置文本LLM的API设置');

    const { apiMode, baseUrl, apiKey, model } = settings.llm;
    const targetUrl = this.getLLMEndpoint(apiMode, baseUrl);
    const body = this.buildLLMBody(apiMode, model, prompt, systemPrompt, options);

    const response = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUrl, apiKey, apiMode, body })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || data.error);
    return this.extractLLMResponse(apiMode, data);
  },

  getLLMEndpoint(apiMode, baseUrl) {
    const base = baseUrl.replace(/\/$/, '');
    switch (apiMode) {
      case 'chat-completions': return base + '/chat/completions';
      case 'responses': return base + '/responses';
      case 'claude': return base + '/messages';
      default: return base + '/chat/completions';
    }
  },

  buildLLMBody(apiMode, model, prompt, systemPrompt, options) {
    const maxTokens = options.maxTokens || 4096;
    const temperature = options.temperature || 0.7;
    switch (apiMode) {
      case 'chat-completions':
        return {
          model, messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt }
          ], max_tokens: maxTokens, temperature: temperature, stream: false
        };
      case 'responses':
        return {
          model, input: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt }
          ], max_output_tokens: maxTokens
        };
      case 'claude':
        return { model, system: systemPrompt || undefined, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature: temperature };
      default:
        throw new Error('不支持的API模式: ' + apiMode);
    }
  },

  extractLLMResponse(apiMode, data) {
    switch (apiMode) {
      case 'chat-completions':
        if (data.choices && data.choices[0]) return data.choices[0].message.content;
        break;
      case 'responses':
        if (data.output && data.output.length > 0) {
          const textBlock = data.output.find(function(b) { return b.type === 'message'; });
          if (textBlock && textBlock.content) return textBlock.content.map(function(c) { return c.text || ''; }).join('');
        }
        if (data.choices && data.choices[0]) return data.choices[0].message.content;
        break;
      case 'claude':
        if (data.content && data.content.length > 0) return data.content.map(function(c) { return c.text || ''; }).join('');
        break;
    }
    throw new Error('无法解析LLM响应');
  },

  // ============ 图片生成 ============

  async callImageGeneration(prompt, imageBase64, options) {
    imageBase64 = imageBase64 || null;
    options = options || {};
    const settings = this.getSettings();
    if (!settings || !settings.image || !settings.image.apiKey) throw new Error('请先配置图片LLM的API设置');

    const apiMode = settings.image.apiMode || 'images';

    if (apiMode === 'responses') {
      return this.callResponsesImageApi(prompt, imageBase64, options);
    }

    // Images API 模式
    if (imageBase64) {
      return this.callImageEdit(prompt, imageBase64, options);
    }

    var baseUrl = settings.image.baseUrl;
    var apiKey = settings.image.apiKey;
    var model = settings.image.model;
    var targetUrl = baseUrl.replace(/\/$/, '') + '/images/generations';
    var body = {
      model: model || 'gpt-image-2', prompt: prompt,
      n: options.n || 1, size: options.size || '1024x1024',
      quality: options.quality || 'high', response_format: options.responseFormat || 'b64_json'
    };
    return this._fetchImageApi(targetUrl, apiKey, body);
  },

  /**
   * Responses API 图片生成（gpt-5.5 等模型内置生图工具）
   */
  async callResponsesImageApi(prompt, imageBase64, options) {
    imageBase64 = imageBase64 || null;
    options = options || {};
    const settings = this.getSettings();
    const baseUrl = settings.image.baseUrl;
    const apiKey = settings.image.apiKey;
    const model = settings.image.model;
    const targetUrl = baseUrl.replace(/\/$/, '') + '/responses';

    const isEdit = !!imageBase64;

    // 构建 image_generation tool
    const tool = {
      type: 'image_generation',
      action: isEdit ? 'edit' : 'generate',
      size: options.size || '1024x1024',
      output_format: options.outputFormat || 'png'
    };
    tool.quality = 'high';

    // 构建 input
    var fullPrompt = PROMPT_REWRITE_GUARD + '\n' + prompt;
    var input;
    if (isEdit && imageBase64) {
      input = [{
        role: 'user',
        content: [
          { type: 'input_text', text: fullPrompt },
          { type: 'input_image', image_url: imageBase64 }
        ]
      }];
    } else {
      input = fullPrompt;
    }

    const body = {
      model: model || 'gpt-5.5',
      input: input,
      tools: [tool],
      tool_choice: 'required'
    };

    const response = await fetch('/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUrl: targetUrl, apiKey: apiKey, body: body })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || data.error);

    // 解析 Responses API 响应
    if (data.output && Array.isArray(data.output)) {
      for (var i = 0; i < data.output.length; i++) {
        var item = data.output[i];
        if (item.type === 'image_generation_call' && item.result) {
          var mime = (item.output_format === 'jpeg') ? 'image/jpeg' : 'image/png';
          return 'data:' + mime + ';base64,' + item.result;
        }
      }
    }

    throw new Error('Responses API 未返回图片数据');
  },

  /**
   * Images API 图生图
   */
  async callImageEdit(prompt, imageBase64, options) {
    options = options || {};
    const settings = this.getSettings();
    const baseUrl = settings.image.baseUrl;
    const apiKey = settings.image.apiKey;
    const model = settings.image.model;
    const targetUrl = baseUrl.replace(/\/$/, '') + '/images/edits';

    // base64 → Blob
    const base64Data = imageBase64.split(',')[1] || imageBase64;
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (var i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/png' });

    const formData = new FormData();
    formData.append('image', blob, 'product.png');
    formData.append('prompt', prompt);
    formData.append('model', model || 'gpt-image-2');
    formData.append('n', options.n || '1');
    formData.append('size', options.size || '1024x1024');
    formData.append('response_format', options.responseFormat || 'b64_json');

    const response = await fetch('/api/image', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      body: formData
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || data.error);

    if (data.data && data.data[0]) {
      if (data.data[0].b64_json) return 'data:image/png;base64,' + data.data[0].b64_json;
      if (data.data[0].url) return data.data[0].url;
    }
    throw new Error('无法获取生成的图片');
  },

  /**
   * 通用图片API请求
   */
  async _fetchImageApi(targetUrl, apiKey, body) {
    const response = await fetch('/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUrl: targetUrl, apiKey: apiKey, body: body })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message || data.error);
    if (data.data && data.data[0]) {
      if (data.data[0].b64_json) return 'data:image/png;base64,' + data.data[0].b64_json;
      if (data.data[0].url) return data.data[0].url;
    }
    throw new Error('无法获取生成的图片');
  },

  // ============ Tavily 搜索 ============

  async callTavilySearch(query, options) {
    options = options || {};
    const settings = this.getSettings();
    if (!settings || !settings.search || !settings.search.enabled || !settings.search.apiKey) {
      throw new Error('请先配置Tavily搜索API');
    }
    const apiKey = settings.search.apiKey;
    const body = {
      query: query, search_depth: options.searchDepth || 'advanced',
      max_results: options.maxResults || 10, include_answer: true, include_raw_content: false
    };
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: apiKey, body: body })
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data;
  },

  // ============ 测试连接 ============

  async testLLMConnection() {
    return this.callTextLLM('你好，请回复"连接成功"', '', { maxTokens: 50 });
  },

  async testImageConnection() {
    return this.callImageGeneration('A simple blue circle on white background', null, {
      size: '1024x1024', responseFormat: 'url'
    });
  }
};

window.ApiClient = ApiClient;
