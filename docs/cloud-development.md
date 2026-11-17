# 微信云开发部署准备

当前只完成本地代码与模板，未创建线上集合、上传文件、部署函数或开通付费服务。当前环境ID cloud1-d3gaw888m9a89e2ff 已写入项目根cloudbaserc.json；还需要上传音频后的真实云存储fileID根。这些是公开配置，不需要发送AppSecret。

小程序通过 `wx.cloud.callFunction` 调用 `study`，函数用微信提供的OPENID识别用户，受控写入托管文档数据库，音频和头像放云存储。手机不再访问电脑127.0.0.1，不需要把原HTTP服务公开。

## 环境与运行时

请选择支持 `wx-server-sdk` 集合API的**传统文档数据库模式**。新版快速开始可能默认推荐PostgreSQL；本实现没有使用SQL或PostgreSQL。若控制台没有文档数据库选项，先核对环境产品类型，不要照着教程开错库。

云函数模板使用官方当前推荐的 `Nodejs20.19`，满足sharp需要的Node.js 20.9以上要求。不要选择Node.js 18或16。控制台提供Node.js 22时也可明确选择22；项目模板与构建目标仍按20.19兼容。`package.json.engines`只声明兼容要求，不会替你切换腾讯云控制台的运行时。[CloudBase运行时](https://docs.cloudbase.net/en/cloud-function/runtime-support)、[云函数配置](https://docs.cloudbase.net/cli-v1/functions/configs)

SDK精确固定 `wx-server-sdk@4.0.2`（2026-11-06从npm官方registry核实）；sharp版本沿用项目package.json。两者在云端Linux安装，不能把Mac本机的sharp/node_modules直接上传。

## 本地构建

在 `miniapp` 目录中执行：

```sh
npm ci
npm run build:cloud
npm run test:cloud:pack
```

源码位于 `cloudfunctions/study/main/`，部署产物独立位于 `cloudfunctions/.deploy/study-v2/`，只允许三个文件：

| 文件 | 用途 |
| --- | --- |
| index.cjs | esbuild打包的云函数及共享校验、课程 |
| index.js | 兼容官方默认 `index.main` 处理入口的CommonJS入口 |
| package.json | 精确声明wx-server-sdk和sharp，在云端安装 |

构建不会复制整个项目，不会读取或携带 `.env`、`.data`、旧会话或AppSecret。通过打包依赖图限制源码来源，拒绝本机fs、旧HTTP服务和未声明依赖；部署目录如出现额外文件会停止，不自动删除。没有源映射文件。项目 `cloudfunctionRoot` 已指向 `.deploy/`，避免微信开发工具上传源码、测试或本机文件。生成目录已被git忽略。

构建仅产生本地文件，不会部署。开发工具里的上传对象必须是 `.deploy` 下的 `study`，不要改回源码目录。

## 数据库与权限（待环境确认后操作）

创建以下四个文档集合，每个应用 `cloud-config/database.rules.json`：

| 集合 | 保存内容 |
| --- | --- |
| wordscape_sessions | 业务会话，微信身份由云函数上下文取得 |
| wordscape_events | 阅读、答题与收藏记录 |
| wordscape_plans | 每日词数与开始日期 |
| wordscape_profiles | 昵称和私有头像引用 |

为 `wordscape_events` 建立复合索引：`owner`升序、`sequence`升序。函数按当前账号和递增序号分页读取，每页100条；不能用时间排序替代该索引。其余集合按文档ID直接访问，不需额外查询索引。

会话 `expiresAt` 为毫秒时间戳，鉴权会主动检查失效时间；不要未经核实给数值字段配置要求日期类型的TTL索引。过期数据清理可后续独立安排，不影响拒绝过期会话。

规则 `read:false, write:false` 禁止小程序直接读写；云函数使用服务端SDK受控访问，并根据当前微信身份隔离账号。不要改成所有人可读，也不要由客户端传owner指定别人的账号。旧HTTP服务的账号记录没有自动迁移至云数据库，本机游客记录仍独立保留。

## 云存储与音频（待环境确认后操作）

将本地 `audio/` 的全部MP3上传到云存储根下的 `audio/`，保留完整相对路径。当前清单为1128条，实际以上传前 `npm run check:audio` 的检查结果为准。例如：

```text
本地：audio/en-GB/v1/某个sha256.mp3
云端：audio/en-GB/v1/同一个sha256.mp3
fileID：cloud://环境ID.桶名/audio/en-GB/v1/同一个sha256.mp3
```

上传后从控制台复制一个真实音频fileID，去掉 `/audio/...` 部分，得到 `MINIAPP_CLOUD_STORAGE_ROOT`。不要自行猜桶名，不要在根前缀重复加audio，也不要保留末尾斜线。

云存储应用 `cloud-config/storage.rules.json`：只有 `audio/` 路径公开可读，客户端全部禁止写入；服务端/管理员负责上传。其余路径（包括头像）保持私有。头像由云函数校验并上传，读取时验证账号后由函数下载私有PNG，以有大小限制的base64数据返回；客户端写入本机沙盒缓存供Image展示。头像不会公开，也不使用私有临时URL或普通downloadFile，因此无需为头像购买域名或配置下载域名白名单；会话token不会进入URL。[官方存储权限规则](https://docs.cloudbase.net/storage/security-rules)

## 小程序构建配置

普通 `.env` 不会自动进入Taro编译。默认环境ID来自项目根cloudbaserc.json，MINIAPP_CLOUD_ENV_ID可明确覆盖；因此正常构建已能使用当前环境。音频fileID根仍须上传后取得。完整公开配置命令如下：

```sh
MINIAPP_BACKEND=cloud \
MINIAPP_CLOUD_ENV_ID='你的真实环境ID' \
MINIAPP_CLOUD_STORAGE_ROOT='cloud://你的环境ID.真实桶名' \
npm run build:weapp
```

环境ID和fileID根须来自同一环境。云函数名称固定为 `study`。云模式缺配置会明确报错，不会偷偷改回HTTP。本机HTTP开发仍可显式使用：

```sh
MINIAPP_BACKEND=http \
MINIAPP_API_BASE='http://127.0.0.1:8788' \
npm run build:weapp
```

云与HTTP会话分开保存，切换环境后要重新登录；原会话不会自动当作新环境会话。微信云登录使用上下文身份，不把 `wx.login` 的code转交旧后端，也不需要本地AppSecret。

## 部署步骤（尚未执行）

1. 确认目标环境ID、文档数据库类型、四集合权限和云存储规则。
2. 完成本地构建和打包检查，上传音频到原路径。
3. 在微信开发工具中，选择目标云环境，对 `.deploy/study-v2` 使用“上传并部署：云端安装依赖”；运行时选Nodejs20.19，处理入口为 `index.main`，函数类型为事件函数。不要创建无需微信身份即可访问的公开HTTP入口。
4. 将内存设为256MB、超时30秒作为初始配置，确认sharp云端安装成功。这里只是模板值，不代表已压测或已开通套餐。
5. 用真实环境配置重新构建小程序，手机测试登录、计划保存、学习记录恢复、头像与音频。用另一个微信号确认彼此不能读取记录。

项目根 `cloudbaserc.json` 已填写用户提供的真实环境ID，配置模板保留在 `cloud-config/cloudbaserc.example.json`；配置文件存在不代表已经部署。不要直接部署占位符模板，不要把云端密钥写进去。依赖安装须使用云端安装选项。[官方配置字段](https://docs.cloudbase.net/cli-v1/functions/configs)

## 本地验证记录

2026-11-06：真实 `build:cloud` 完成，输出仅3个部署文件；源码路径、外部依赖与敏感配置排除检查通过。打包安全测试3项通过、0项失败。尚未用真实云环境验证Linux依赖安装、权限规则、复合索引、真机跨设备同步和计费，不能把本地通过当成已上线。

## 已知依赖风险

当前锁定的 `wx-server-sdk@4.0.2` 通过 `@cloudbase/node-sdk` 引入旧版axios，并通过 `@cloudbase/database` 引入带上游安全公告的lodash.set/lodash.unset。尚未验证与新版传递依赖的兼容性，因此没有强制覆盖依赖或执行可能破坏SDK的自动修复；云包尚未完成生产环境验收。

项目既有Taro开发工具链中的decompress也有critical级审计告警，属于本机构建依赖，不在本次云函数上传包中；不能据此声称云函数包含这个生产依赖。上述SDK传递依赖与Taro开发链问题应分别评估。

## 本地验收结果
2026-11-06：94通过、0失败；类型检查、微信构建、云函数打包通过，现有1128条音频完整性通过。最后的连续分页及私有PNG校验复查已通过，云函数已重打包。微信包1721211字节。以上均不代表云端验收，未连接或创建线上数据库。

## 实际部署排查记录（2026-11-06）
控制台确认study为Node.js16.13、入口index.main、256M、超时3秒，与本地Nodejs20.19及30秒配置不一致。17:32:44调用失败443；链路日志显示平台node16/runtime.js的writeRuntimeFile发生读取undefined.toString异常。尚未验证更换运行时后的结果，不能认定仅此一处问题。当前微信控制台详情只读；待确认后创建正确运行时的新函数，保留旧函数和数据库，再验证入口加载及真实登录。package.engines不替代云端运行环境设置。

### study-v2 修复
用户授权后已在微信控制台创建Node20.19的study-v2，IDE需在.deploy目录右键“同步云函数列表”后，才会显示“上传并部署”而非“创建并部署”。客户端与cloudbaserc均使用study-v2，构建目录跟随配置函数名。实测正式函数拒绝微信自动注入的tcbContext及userInfo，入口现只剥离这两个平台字段，业务严格校验保留；身份仍只读取getWXContext().OPENID。

验证结果：参数修复重新部署后，模拟器实际登录成功，页面切为微信账号记录。旧study保留；真机与新函数超时设置仍需核验。

音频配置已落盘至cloud-config/client.json的storageRoot，取自实际上传文件ID；正常build:weapp自动读取，无需每次手工设置变量。显式MINIAPP_CLOUD_STORAGE_ROOT仍可覆盖。2026-11-06重新构建后已确认产物包含真实根地址，模拟器点击investigate发音，无未配置或下载/播放错误；未做听感核验。
