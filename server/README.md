# 学习后端

启动：在 `miniapp/` 安装依赖后运行 `npm run server`，自动加载存在的私有 `.env`，监听 `127.0.0.1:8788`。微信开发者工具可开启本地不校验合法域名；真机和发布必须使用用户配置的 HTTPS 域名与反向代理。禁止把开发监听直接暴露到公网。

后端环境变量：`WX_APP_ID`、`WX_APP_SECRET`（仅服务进程可见），可选 `PORT=8788`、`STUDY_DATA_FILE=/绝对路径/state.json`。没有真实微信配置时课程仍可读取，但登录明确返回 503；没有测试账号或假登录入口。微信登录凭证只发给微信官方接口，不记入日志，不向客户端返回 session_key、OpenID 或 AppSecret。

| 接口 | 请求 | 返回 |
|---|---|---|
| GET /api/days | 无 | `{days:[{day,date,words:数量}],plan}` |
| GET /api/days/:day | 已发布学习日 | 原始 DailyBatch |
| POST /api/session | `{code:wx.login所得code}` | `{token,expiresAt}` |
| POST /api/session/logout | Bearer token | `{ok:true}`，仅撤销当前凭证 |
| GET /api/events | `Authorization: Bearer token` | `{events}` |
| POST /api/events | 同上，请求体如下 | `{event}` |
| GET /audio/...mp3 | 实际音频文件路径 | MP3；缺失返回 404 |

事件共同字段：`{id:UUID,day:number,lessonId:string,type:'read'|'quiz'|'favorite'}`。阅读无额外字段；测验需 `answers:number[]`（选项从 0 开始，与当前情境题数相同）；收藏需 `word:string,favorite:boolean`。服务器补入 `createdAt`，测验补入 `score`。收藏取消也是新事件，以 UUID 区分；界面按同一词最后事件判断当前收藏。提交同一 UUID 与相同内容返回原记录，内容变化返回 409。服务不接收用户 ID 或客户端分数。

数据存入 `.data/state.json`，采用文件夹 0700、文件 0600 权限。会话有效 7 天，磁盘仅保存随机 token 的 SHA-256 及 OpenID 的 SHA-256。所有读取和写入经过同一队列，先写临时文件再原子改名，避免并发覆盖。解析失败立即报错，不覆盖损坏文件。请备份文件并只运行一个后端进程；多进程与多机器部署需另行设计共享存储，首版不支持。个人事件上限 100000 条，请求体上限 16KB，每来源地址每分钟最多 20 次登录。

课程按 `src/content/catalog.json` 加载，目前第1～3天，启动时复用网站的每日规划和严格验证；发现不一致直接终止。此服务不调用或改写网站数据库。

音频根目录为 `miniapp/audio/`，只提供真实 `.mp3` 文件，不合成、不转为浏览器朗读、不返回假音频。词与段落音频路径由前端音频清单决定。正式服务的反向代理须允许完整 MP3 响应；首版播放器以完整文件播放。

检查：`node --import tsx --test server/server.test.ts`。测试将临时持久文件放入系统临时目录，唯一模拟行为是测试内部注入微信交换器，生产入口不开放注入。

上线前由用户完成：真实小程序 AppID 与后端 AppSecret、主体注册与备案、HTTPS 域名和 request/downloadFile 合法域名、私有密钥配置、现有MP3目录部署和真机试听、持久目录备份、微信后台隐私声明与正式提审。反向代理到本机 8788，配置 HTTPS、请求大小和请求速率限制；不要把 `.data` 目录放在静态目录下。

2026-10-20：567条英式MP3已在audio/en-GB/v1补齐。音频使用固定Daniel声线离线生成；运行服务只读取文件，不实时合成。新增真实单词/段落HTTP200及返回字节完整性检查。

## 账号资料接口
GET /api/profile 读取昵称与头像状态；POST /api/profile 保存nickName；PUT /api/profile/avatar 接收JSON base64；GET /api/profile/avatar返回PNG。以上均须Bearer会话。支持真实JPEG/PNG，原文件不超过512KiB、尺寸不超过4096×4096，保存为256×256 PNG；需安装sharp及部署平台的optional原生依赖。资料默认保存于学习记录文件同目录profiles.json和avatars/，可用PROFILE_DATA_FILE指定路径；学习记录文件不改动。

## 每日词数计划
GET /api/plan返回当前账号计划或null；POST /api/plan接收{id: UUID, wordsPerDay: 10..80整数}，二者均要求Bearer登录。服务端用北京时间当天开始，返回{id,wordsPerDay,startedOn,version:"personal-v1"}；相同id同词数重试幂等，其他重复创建返回409。计划存于学习文件同目录plans.json，可用PLAN_DATA_FILE指定，学习state.json及资料不变。词表分天在共享personal-plan模块计算；课程生成不包含在该接口内。

## 计划日期修改
创建POST /api/plan可额外传startedOn（YYYY-MM-DD），省略时沿用北京时间当天；仅允许过去或今天。POST /api/plan/update接收{id,wordsPerDay,startedOn}，须Bearer登录且id属于当前已有计划；保存后保留原id/version，仅更新日期/词数。旧学习事件、资料与课程不修改。

GET /api/days的各项新增targetWords（完整有序目标词），用于确认已有课程是否与个人计划匹配，不能仅按词数判断。

## 安全边界
退出接口撤销当前会话，不影响同账号其他设备；缺失或格式错误凭证返回401。事件接口先认证再读请求体。持久数据损坏返回500，保留原文件，不向客户端暴露校验细节。音频在解析符号链接后再次验证真实路径，禁止跨出音频根目录。

2026-10-23全词库随机更新：默认第1～3天为all-words-shuffle-v2新词表对应原创课程，新情境编号301～306。旧事件按原编号读取，不接受把旧情境提交为新课程；旧收藏由客户端内置归档只读回看。音频保留新旧课程全部1128条，服务端仍按实际路径读取。
