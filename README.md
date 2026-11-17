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

## AI（语音助手、写配料做法）

用阿里云百炼 **Qwen 的 Token Plan**，通过 Supabase 边缘函数 `mp-ai`（代码在 `supabase/functions/mp-ai/`）调用，key 不会出现在网页里。

开通：Supabase 后台 → 项目 `breakfast-decider` → **Edge Functions → Secrets**，加：

| 名字 | 填什么 |
|---|---|
| `QWEN_API_KEY` | Token Plan 的 API Key（必填） |
| `QWEN_BASE_URL` | 可不填。默认新加坡：`https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`；国内的 key 填 `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`。以 Token Plan 控制台显示的为准 |
| `QWEN_MODEL` | 可不填，默认 `qwen3.7-plus`。以 Token Plan 控制台里能用的模型名为准 |

没填 key 时 App 照常能用：语音助手用本地规则听懂常见说法，「AI 写配料做法」对推荐池里的菜照样能填。

语音：iPhone 主屏 App 里浏览器自带的语音识别经常没反应，这时点输入框、用键盘上的 🎤 说话最稳。

## 可以再配的

- 天气：在 `js/config.js` 里填家里的经纬度（`weather.latitude / longitude`），日期下面就会显示天气。不填就只显示节气和暖心话。
- 菜的照片：常做的菜自带实拍照片（`photos/`，来自维基共享资源，作者和授权在「我的」→「图片来源」）；新加的菜用 Pollinations 自动配图，配不出就显示暖色方块。每道菜的做法页也能「📷 换照片」。
- 图标：微软 Fluent Emoji 的 🍜（MIT 许可），见 `icons/CREDITS.md`。

## 测试

```bash
node tests/smoke.mjs
```

用两部模拟 iPhone 13 和一个假的同步后端，逐项过交接文档第 6 节的验收清单（80 多项），截图存在 `tests/shots/`。
