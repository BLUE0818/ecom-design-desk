const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// 启用CORS
app.use(cors());

// 解析JSON请求体
app.use(express.json({ limit: '50mb' }));

// 配置multer用于处理文件上传
const upload = multer({ storage: multer.memoryStorage() });

// 静态文件服务 - 服务前端文件
app.use(express.static(path.join(__dirname)));

// 通用：安全解析API响应，处理非JSON情况
async function safeParseResponse(response, label) {
  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    let detail = '';
    if (contentType.includes('json')) {
      const errBody = await response.json();
      detail = errBody.error?.message || errBody.error || JSON.stringify(errBody);
    } else {
      const text = await response.text();
      // 截取前200字符，避免返回完整HTML页面
      detail = text.substring(0, 200);
    }
    throw new Error(`${label}返回错误(${response.status}): ${detail}`);
  }

  if (!contentType.includes('json')) {
    const text = await response.text();
    const snippet = text.substring(0, 200);
    throw new Error(
      `${label}返回了非JSON响应，请检查Base URL是否正确（应包含版本号如 /v1）。\n` +
      `实际返回: ${snippet}`
    );
  }

  return response.json();
}

// API代理 - 文本LLM请求
app.use('/api/llm', async (req, res) => {
  try {
    const { targetUrl, apiKey, apiMode, body, headers: customHeaders } = req.body;
    
    if (!targetUrl || !apiKey) {
      return res.status(400).json({ error: '缺少目标URL或API Key' });
    }

    // 根据API模式设置不同的请求头
    let headers = {
      'Content-Type': 'application/json',
    };

    if (apiMode === 'claude') {
      // Claude Messages API 使用 x-api-key
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      // OpenAI兼容格式使用 Authorization: Bearer
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // 合并自定义headers
    if (customHeaders) {
      Object.assign(headers, customHeaders);
    }

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await safeParseResponse(response, '文本LLM');
    res.json(data);
  } catch (error) {
    console.error('LLM代理错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// API代理 - 图片生成请求 (gpt-image-2)
app.use('/api/image', async (req, res) => {
  try {
    const { targetUrl, apiKey, body } = req.body;
    
    if (!targetUrl || !apiKey) {
      return res.status(400).json({ error: '缺少目标URL或API Key' });
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await safeParseResponse(response, '图片API');
    res.json(data);
  } catch (error) {
    console.error('图片生成代理错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// API代理 - 图片编辑请求 (图生图，支持FormData)
app.post('/api/image-edit', upload.single('image'), async (req, res) => {
  try {
    const { prompt, model, n, size, response_format } = req.body;
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    const baseUrl = req.headers['x-base-url'];
    
    if (!apiKey || !baseUrl || !req.file) {
      return res.status(400).json({ error: '缺少必要参数：apiKey、baseUrl或图片文件' });
    }

    // 构建FormData发送到OpenAI
    const FormData = (await import('formdata-node')).FormData;
    const formData = new FormData();
    formData.append('image', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);
    formData.append('prompt', prompt);
    formData.append('model', model || 'gpt-image-2');
    formData.append('n', n || '1');
    formData.append('size', size || '1024x1024');
    formData.append('response_format', response_format || 'b64_json');

    const targetUrl = `${baseUrl.replace(/\/$/, '')}/images/edits`;
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    const data = await safeParseResponse(response, '图片编辑API');
    res.json(data);
  } catch (error) {
    console.error('图片编辑代理错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// API代理 - 联网搜索请求 (Tavily)
app.use('/api/search', async (req, res) => {
  try {
    const { apiKey, body } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: '缺少Tavily API Key' });
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...body,
        api_key: apiKey,
      }),
    });

    const data = await safeParseResponse(response, '搜索API');
    res.json(data);
  } catch (error) {
    console.error('搜索代理错误:', error);
    res.status(500).json({ error: error.message });
  }
});

// 所有其他路由返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║   电商设计台                                    ║
  ║   服务已启动，请访问: http://localhost:${PORT}               ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
});
