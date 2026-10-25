import type { ColdStartTasteDimension } from "@soqaro/shared";

/**
 * 发现页「调整偏好」分类目录。
 *
 * 约束：每个 option 的 label 同时是网易云/QQ 音乐召回时的搜索关键词
 * （服务端 recall 会以标签原文调用 searchTracks），因此所有标签都必须是
 * 平台上可直接搜出大量歌曲的常见词，保证「每个分类必然有歌曲」。
 * hint 仅用于弹窗内的文案说明，不参与存储与搜索。
 */
export type TasteOption = {
  label: string;
  hint?: string;
};

export type TasteDimensionGroup = {
  id: ColdStartTasteDimension;
  label: string;
  description: string;
  options: TasteOption[];
};

export const TASTE_DIMENSION_GROUPS: TasteDimensionGroup[] = [
  {
    id: "genre",
    label: "曲风",
    description: "从摇滚到 City Pop，选你循环最多的声音",
    options: [
      { label: "流行", hint: "金曲与主打" },
      { label: "摇滚", hint: "乐队与吉他" },
      { label: "民谣", hint: "木吉他与叙事" },
      { label: "电子", hint: "合成器与节拍" },
      { label: "说唱", hint: "律动与押韵" },
      { label: "R&B", hint: "灵魂律动" },
      { label: "爵士", hint: "即兴与摇摆" },
      { label: "蓝调", hint: "根源布鲁斯" },
      { label: "古典", hint: "交响与钢琴" },
      { label: "轻音乐", hint: "纯音乐伴奏" },
      { label: "Lo-Fi", hint: "低保真律动" },
      { label: "后摇", hint: "器乐铺陈" },
      { label: "独立", hint: "独立音乐" },
      { label: "ACG", hint: "动漫与游戏" },
      { label: "国风", hint: "古风与戏腔" },
      { label: "City Pop", hint: "都市复古" },
      { label: "蒸汽波", hint: "复古电子" },
      { label: "K-Pop", hint: "韩流偶像" },
      { label: "J-Pop", hint: "日系流行" },
      { label: "金属", hint: "重型吉他" },
      { label: "朋克", hint: "三和弦能量" },
      { label: "雷鬼", hint: "牙买加律动" },
      { label: "乡村", hint: "叙事吉他" },
      { label: "拉丁", hint: "桑巴与波萨" },
      { label: "舞曲", hint: "迪斯科律动" },
      { label: "原声", hint: "OST 与主题曲" }
    ]
  },
  {
    id: "language",
    label: "语种",
    description: "你最常听的歌用什么语言唱",
    options: [
      { label: "华语", hint: "国语流行" },
      { label: "粤语", hint: "港乐金曲" },
      { label: "日语", hint: "日语歌" },
      { label: "韩语", hint: "韩语歌" },
      { label: "英语", hint: "英文歌" }
    ]
  },
  {
    id: "region",
    label: "地区",
    description: "偏好哪些音乐市场",
    options: [
      { label: "欧美", hint: "欧美流行" },
      { label: "日本", hint: "日本市场" },
      { label: "韩国", hint: "韩国市场" },
      { label: "港台", hint: "港台经典" },
      { label: "东南亚", hint: "泰语越语等" },
      { label: "欧洲", hint: "欧陆小语种" }
    ]
  },
  {
    id: "scene",
    label: "聆听场景",
    description: "什么时刻会想戴上耳机",
    options: [
      { label: "夜听", hint: "晚安与助眠" },
      { label: "专注", hint: "学习与工作" },
      { label: "运动", hint: "健身与跑步" },
      { label: "驾车", hint: "公路与通勤" },
      { label: "咖啡", hint: "咖啡馆小憩" },
      { label: "派对", hint: "聚会嗨歌" },
      { label: "冥想", hint: "疗愈放空" },
      { label: "雨天", hint: "雨天氛围" },
      { label: "清晨", hint: "温柔唤醒" },
      { label: "周末", hint: "懒人周末" },
      { label: "春日", hint: "踏青出行" },
      { label: "夏日", hint: "盛夏海边" },
      { label: "秋日", hint: "落叶散步" },
      { label: "冬夜", hint: "围炉取暖" }
    ]
  },
  {
    id: "era",
    label: "年代",
    description: "怀旧还是追新",
    options: [
      { label: "经典老歌", hint: "时光金曲" },
      { label: "80年代", hint: "迪斯科与金曲" },
      { label: "90年代", hint: "黄金年代" },
      { label: "00年代", hint: "千禧流行" },
      { label: "10年代", hint: "网络时代" },
      { label: "新歌", hint: "最新发行" },
      { label: "复古", hint: "怀旧回潮" }
    ]
  }
];

/** 常听艺人快捷选择（保存后以 9.0 分种子驱动艺人召回）。 */
export const TASTE_POPULAR_ARTISTS = [
  "周杰伦", "林俊杰", "陈奕迅", "邓紫棋", "薛之谦", "陶喆",
  "五月天", "告五人", "草东没有派对", "Taylor Swift",
  "Bruno Mars", "Billie Eilish", "米津玄师", "YOASOBI", "RADWIMPS"
];

export const TASTE_SELECTION_LIMIT = 24;

export const TASTE_ARTIST_LIMIT = 12;
