# iPhone静音设置平台判断

## propose
开发工具运行平台是`devtools`，不应调用仅用于iOS的静音开关配置。

## apply
- 播放前通过微信运行环境信息读取平台，不使用会受模拟设备型号影响的设备信息。
- 仅`ios`调用`setInnerAudioOption`。
- `devtools`、Android及桌面平台直接继续播放。

## archive
平台判断已加入自动测试，音频业务流程保持不变。
