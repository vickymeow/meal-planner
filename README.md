# 早饭晚饭 · 一家人好好吃饭

全家（妈妈、Vicky、小陈、爸爸）的早饭 + 晚饭规划：妈妈前一天晚上定计划，早上照着做；
家里人在自己手机上点早饭、点想吃的、说在不在家。**几部手机看到同一份，改了自动同步。**

界面照 mock v19（「妈妈第一屏」，Vicky 已确认）做；产品决定见交接文档 `CLAUDE-HANDOVER.md`。

## 两屏

| 谁 | 打开看到 |
|---|---|
| 妈妈 | 顶部「📋 定计划 / 🍳 照着做」两个大按钮（手动切，不按时间）；定一周晚饭、看大家想吃、看谁在家；右下角悬浮话筒「说话」定计划 |
| Vicky / 小陈 / 爸爸 | 逐天点早饭、点想吃（带 😊 / 😊😊 / ❤️❤️❤️）、改在不在家、加客人；「今日菜单」页签 |

底部常驻「今天 / 菜谱 / 买菜 / 我的」。

## 文件

```
index.html            页面
css/mock-v19.css      从 mock v19 原样抽出的样式（不要改这里）
css/app.css           正式版的改动（全屏手机布局等）
js/config.js          Supabase 地址 + publishable key、天气经纬度、自动配图开关
js/data.js            家里人、起步菜谱、推荐新菜、节气、暖心话
js/store.js           同步层
js/app.js             界面
icons/                App 图标（Fluent Emoji 🍜，MIT）
photos/               菜品照片（维基共享资源，免费授权）
js/photos.js          每张照片的作者和授权
supabase/functions/   AI 边缘函数 mp-ai（Qwen）
supabase/schema.sql   同步用的表和函数
tests/smoke.mjs       两部模拟 iPhone 的验收测试
```

纯静态，不需要构建。

## 同步怎么做的

- 后端：Supabase（Vicky 账号里已有的 `breakfast-decider` 项目，免费层），新加了 `mp_households`、`mp_items` 两张表和 `mp_pull`、`mp_push` 两个函数。旧表 `breakfast_state` 没动。
- 每一条数据单独一行（比如「Vicky 周二早饭」「周三晚饭」「小陈想吃红烧肉」），谁后改谁算，几个人同时改不同的东西不会互相覆盖。
- 手机上先存本地、马上显示，再推上去；每 8 秒、以及切回 App 时拉一次别人的改动。没网时先存着，有网自动补传。
- 安全：表对浏览器完全关闭，只能通过函数读写，而且要带「家庭密钥」。**家庭密钥不在仓库里**（仓库是公开的），只放在发给家里人的链接里：`https://<网址>/?h=<家庭密钥>&me=<mom|vicky|chen|dad>`。
- 起步是空的：没有 demo 数据。第一次连上时自动放进起步菜谱（妈妈的 8 道早饭 + 鸡蛋三明治 + 一些晚饭菜），只放一次。

## 部署到 Vercel

最省事、也绕开之前 CLI 403 的办法：**Vicky 自己在网页上导入这个仓库**。

1. 打开 https://vercel.com/new ，用 GitHub 登录。
2. 选 `vickymeow/meal-planner` → Import。Framework 选 **Other**，Build Command 和 Output Directory 都留空。
3. Deploy。以后 `main` 分支一有提交就自动更新。

不需要设任何环境变量。

## 发给家里人

1. 用 Vicky 的链接打开（家庭密钥在 Claude 给 Vicky 的消息里），进「我的」→「发给家里人」，每人有一个自己的链接。
2. 在每个人的 iPhone 上用 **Safari** 打开自己的链接 → 分享 → **添加到主屏幕**。图标名字是「早饭晚饭」。
3. 妈妈的手机：用「妈妈的链接」打开再加到主屏幕，打开就是妈妈那屏。

## AI（语音助手、听写、写配料做法）

用阿里云百炼 Qwen，通过 Supabase 边缘函数 `mp-ai`（代码在 `supabase/functions/mp-ai/`）调用，key 不会出现在网页里。连接方式照旧版早饭 App 实测能用的写法（对话带 `enable_thinking: false`，语音走百炼原生接口）。

Supabase 后台 → 项目 `breakfast-decider` → **Edge Functions → Secrets** 里现在有两把 key，函数都会用：

| 名字 | 是什么 | 用法 |
|---|---|---|
| `DASHSCOPE_API_KEY` | **Token Plan**（`sk-sp-` 开头，包月），旧版就在用 | 优先用；地址 `token-plan.ap-southeast-1.maas.aliyuncs.com` |
| `QWEN_API_KEY` | 按量付费的 key（不是 Token Plan） | Token Plan 不通时才用；地址 `dashscope-intl.aliyuncs.com` |

- 对话模型：自动从 `qwen3.8-flash` 开始试，套餐里没有的跳过（可用 `QWEN_MODEL` 指定）
- 语音听写：`qwen-audio-3.0-asr-flash`（可用 `QWEN_ASR_MODEL` 指定）。手机录音后在网页里转成 16k WAV 再送去
- 检查能不能用：给 `mp-ai` 发 `{"h": 家庭密钥, "task": "diag"}`，会回用的是哪把 key、哪个地址、哪个模型（不回 key 本身）

- **菜品照片**：没照片的菜，App 会自动请阿里云**通义万相**（`wan2.2-t2i-flash`）画一张写实菜品照：先让 Qwen 描述这道菜的样子再画，缩到 720 宽 JPEG（约 100KB），存进 Supabase 存储 `mp-photos`，写进家里的同步库。Token Plan 里没有生图模型，所以这部分走按量付费的 key（代金券抵扣），大约几分钱一张。做法页可以「🎨 换一张 AI 图」。关掉：`js/config.js` 里 `aiPhotos: false`
- **读给我听**：用 Qwen 语音合成（`qwen3-tts-flash`，女声 Cherry，走 Token Plan）；连不上就用手机自带的声音

没有 key 或连不上时 App 照常能用：语音助手用本地规则听懂常见说法；说话退回浏览器自带的识别或键盘上的 🎤。

## 可以再配的

- 天气：在 `js/config.js` 里填家里的经纬度（`weather.latitude / longitude`），日期下面就会显示天气。不填就只显示节气和暖心话。
- 菜的照片：常做的菜自带实拍照片（`photos/`，来自维基共享资源，作者和授权在「我的」→「图片来源」）；新加的菜用 Pollinations 自动配图，配不出就显示暖色方块。每道菜的做法页也能「📷 换照片」。
- 图标：微软 Fluent Emoji 的 🍜（MIT 许可），见 `icons/CREDITS.md`。

## 测试

```bash
node tests/smoke.mjs
```

用两部模拟 iPhone 13 和一个假的同步后端，逐项过交接文档第 6 节的验收清单（80 多项），截图存在 `tests/shots/`。
