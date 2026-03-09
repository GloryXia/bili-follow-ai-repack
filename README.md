# bili-follow-ai-repack

用 Node.js 直接调用 B 站接口，拉取关注列表并结合 LLM（支持 **智谱 GLM** / **月之暗面 Kimi** / **MiniMax**）进行分类，按 B 站常见大分区给每个 UP 主分配一个"主分组"，然后统一批量同步到 B 站。

## 特点

- 只走接口，不操作 DOM
- 默认是更保守的低风险参数
- 支持 `DRY_RUN` 先只读不写
- 支持缓存、断点续跑、日志记录
- 支持 WBI 签名接口获取空间信息与最近视频
- 关注列表全量本地缓存，防止中途网络中断丢失进度
- 统一提示词模块 (`src/prompts.js`)，所有模型共享同一套指令
- 健壮的 JSON 解析器，自动跳过模型输出的 `<think>` 推理标签与 Markdown 包裹

## 快速开始

```bash
npm install
cp .env.template .env
# 修改 .env 中的 Cookie、API Key 等
npm start
```

## 推荐运行顺序

1. 先保持 `DRY_RUN=true`，只看分类结果。
2. 抽查分类没问题后，把 `DRY_RUN=false`。
3. 继续保持 `MOVE_MODE=false`，先"复制到分组"，不要一开始就移动。

## 运行流程

`npm start` 会按顺序执行以下步骤：

1. **获取关注列表** — 逐页拉取全部关注 UP 主，缓存至 `data/followings.json`（下次启动直接读取，不再重复拉取）。
2. **逐批分类** — 按 `PAGE_SIZE` 为单位，对尚未分类的 UP 主调用 LLM 批量分类，结果写入 `data/cache.json`。
3. **批量同步分组** — 分类结束后，统一扫描 `cache.json`，在 B 站创建缺失分组，然后以每次 50 人为一批将 UP 主加入/移入对应分组。

> **提示**：步骤 1、2 可随时中断继续，已缓存的数据不会丢失；步骤 3 仅在 `DRY_RUN=false` 时执行。

## 主要环境变量

| 变量 | 说明 |
|------|------|
| `BILI_COOKIE` | B 站登录态 Cookie |
| `BILI_UID` | 你的 B 站 UID |
| `LLM_PROVIDER` | 可选 `zhipu` / `kimi` / `minimax`，默认 `zhipu` |
| `ZHIPU_API_KEY` | 使用 GLM 时必填 |
| `KIMI_API_KEY` | 使用 Kimi 时必填 |
| `MINIMAX_API_KEY` | 使用 MiniMax 时必填 |
| `ALLOW_CUSTOM_CATEGORIES` | `true` / `false`，开启大模型细粒度自由分组 |
| `DRY_RUN` | `true` 时只分类不写入 B 站 |
| `MOVE_MODE` | `true` 时用"移动"替代"复制"（更激进） |
| `FORCE_RECLASSIFY` | `true` 时忽略缓存，强制对所有 UP 主重新分类并重新拉取关注列表 |
| `PAGE_SIZE` | 每批处理的 UP 主数量 |
| `TAG_WRITE_DELAY_MS` | 每次调用 B 站写入接口的间隔（毫秒） |

## 输出文件

| 文件 | 说明 |
|------|------|
| `data/followings.json` | 全量关注列表缓存 |
| `data/cache.json` | mid → 分类结果的缓存 |
| `data/tags.json` | 分组名 → B 站分组 ID 的映射 |
| `logs/run.log` | 运行日志 |

## 项目结构

```
src/
├── main.js        # 主流程：拉取 → 分类 → 批量同步
├── config.js      # 环境变量解析与默认分类列表
├── bili.js        # B 站 API 封装（关注列表、空间信息、分组管理）
├── wbi.js         # WBI 签名算法
├── prompts.js     # 统一的 LLM 提示词与响应解析
├── glm.js         # 智谱 GLM 客户端
├── kimi.js        # 月之暗面 Kimi 客户端
├── minimax.js     # MiniMax 客户端
└── utils.js       # 通用工具函数
scripts/
└── sync_tags.js   # 独立脚本：仅读取 cache.json 批量同步分组（不调用 LLM）
```

## 常见问题

### 1. 请求突然失败变多
先暂停一段时间再继续。对老号来说，慢一点通常比快一点更稳。

### 2. 出现验证码或返回拦截
说明频率过高或登录态异常。先检查 Cookie 是否有效，再拉长延迟。

### 3. 已有分组会不会被覆盖
不会。默认是新增或复用分组，并把 UP 加进去。只有 `MOVE_MODE=true` 时才会更激进。

### 4. DRY_RUN 切到 false 后分组不生效
旧的 `DRY_RUN=true` 会在 `tags.json` 中写入 `dry-run-xxx` 假 ID，程序会在非 DRY_RUN 模式下自动清理这些假数据。确保 `FORCE_RECLASSIFY=true` 让缓存重新生效。

### 5. `scripts/sync_tags.js` 的核心适用场景
此独立离线同步脚本是主流程的备用“逃生舱”，核心支持三个场景：
- **手动纠错后一键生效**：如果您发现大模型的少数分类不准，可直接在 `data/cache.json` 中搜索 UID 手动修改 `"category"` 值，然后运行此脚本，瞬间拉平到 B 站，无需再耗费大模型额度。
- **配合 DRY_RUN（沙盒测试模式）**：您可以在 `.env` 保留 `DRY_RUN=true`，让主程序安全地跑完全量数据并只保存在本地。经查阅 `cache.json` 确认分类全部靠谱后，运行此脚本闭眼批量发布到 B 站。
- **应对网络错误打断**：如果 `npm start` 在最后一步“批量同步”期间网络断开或 B 站接口抽风打断，不必重启主程序重新校验。稍后直接运行此脚本即可完成善后。
```bash
node scripts/sync_tags.js
```
