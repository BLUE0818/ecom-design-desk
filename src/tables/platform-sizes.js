// 平台尺寸参考表
// 基于 ecommerce-image-prompt 技能的 05-platform-sizing.md

const PLATFORM_SIZE_TABLE = {
  taobao: {
    name: '淘宝',
    mainImage: { width: 800, height: 800, ratio: '1:1' },
    detailPage: { width: 750, heightRange: '1000-1500', unit: '每屏' },
    tips: {
      mainImage: '主图建议800×800px，四边安全留白，主体居中',
      detailPage: '详情页宽750px，每屏高度1000-1500px，移动端优先',
      crop: '可兼容裁切为1:1和3:4比例'
    }
  },
  tmall: {
    name: '天猫',
    mainImage: { width: 800, height: 800, ratio: '1:1' },
    detailPage: { width: 790, heightRange: '1000-1500', unit: '每屏' },
    tips: {
      mainImage: '主图建议800×800px，品牌感更强，质感要求高',
      detailPage: '详情页宽790px，移动端优先按750px宽度组织',
      crop: '可兼容裁切为1:1和3:4比例'
    }
  },
  jd: {
    name: '京东',
    mainImage: { width: 800, height: 800, ratio: '1:1' },
    detailPage: { width: 750, mobileWidth: 640, heightRange: '1000-1500', unit: '每屏' },
    tips: {
      mainImage: '主图建议800×800px，参数清晰，信任感强',
      detailPage: 'PC端宽750px，移动端宽640px，优先生成750px宽版式',
      crop: '可兼容裁切为1:1比例'
    }
  },
  pdd: {
    name: '拼多多',
    mainImage: { width: 750, height: 352, ratio: '约2.13:1' },
    detailPage: { widthRange: '480-1200', heightRange: '800-1200', unit: '每屏' },
    tips: {
      mainImage: '主图建议750×352px，横版宽图，信息直给',
      detailPage: '详情页宽480-1200px，信息块更短、更直给',
      crop: '主图为横版宽图，注意主体居中展示'
    }
  },
  douyin: {
    name: '抖音电商',
    mainImage: { width: 800, height: 800, ratio: '1:1' },
    detailPage: { width: 750, altWidth: 1242, singleScreen: { width: 540, height: 960 }, heightRange: '900-1500', unit: '每屏' },
    tips: {
      mainImage: '主图建议800×800px，视觉冲击力强，场景感突出',
      detailPage: '详情页宽750px或1242px，优先竖屏节奏，首屏要更抓人',
      crop: '可兼容裁切为1:1和9:16比例'
    }
  },
  xiaohongshu: {
    name: '小红书',
    mainImage: { width: 1080, height: 1440, ratio: '3:4' },
    detailPage: { width: 1080, height: 1920, ratio: '3:4', heightRange: '1000-1500', unit: '每屏' },
    tips: {
      mainImage: '主图建议1080×1440px（3:4），审美感强，生活方式化',
      detailPage: '详情页1080×1920px或3:4分屏长图，按种草卡片节奏组织',
      crop: '3:4竖版构图，注意留白和美感'
    }
  },
  '1688': {
    name: '1688',
    mainImage: { width: 800, height: 800, ratio: '1:1' },
    detailPage: { width: 750, heightRange: '1000-1500', unit: '每屏' },
    tips: {
      mainImage: '主图建议800×800px，参数、规格、应用范围优先',
      detailPage: '详情页宽750px，可增加参数表、实力背书、包装与发货模块',
      crop: '可兼容裁切为1:1比例'
    }
  },
  amazon: {
    name: '亚马逊',
    mainImage: { width: 2000, height: 2000, ratio: '1:1' },
    detailPage: { width: 970, heightRange: '1000-1500', unit: '每屏', type: 'A+' },
    tips: {
      mainImage: '主图建议2000×2000px，首张纯白背景，产品占比85%以上',
      detailPage: 'A+详情模块按横向信息模块组织，副图重功能与对比',
      crop: '主图必须纯白背景，严格遵守亚马逊规范'
    }
  }
};

// 导出
window.PLATFORM_SIZE_TABLE = PLATFORM_SIZE_TABLE;
