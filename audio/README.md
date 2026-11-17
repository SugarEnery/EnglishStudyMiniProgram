# 英式MP3资源

按 `src/content/audio.json` 中的路径放置真实音频，例如 `audio/en-GB/v1/<sha256>.mp3`。清单中的text是需要朗读的精确文本。不得用空文件或其他格式冒充MP3。

上传后执行 `npm run audio:manifest` 并重新编译客户端；正式发布前执行 `node scripts/audio-manifest.mjs --strict`，必须没有缺失。此目录由独立后端以 `/audio/` 提供，不打包进小程序。

当前随机课程与旧版归档合计1056词＋72段，共1128条Daniel en_GB合成音频，缺失0条。生成过程及文件指纹保存在docs/audio-verification.json；全部文件已真实解码验证。运行后端后即可通过原地址播放。
